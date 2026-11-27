import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

import { type Env, loadEnv } from '../../src/core/env';
import { createDatabaseProject, deleteDatabaseProject } from '../../src/fixtures/database-project';
import { createLocalGitRepository, type LocalGitRepository } from '../../src/fixtures/local-git';
import { queryDatabaseRows, runDatabaseSql } from '../helpers/database';
import { createApiJsonClient } from '../helpers/http';
import { ensureOwnedAccount } from '../helpers/accounts';
import { fundAccount, isDeployedTarget } from '../helpers/manifest-project';
import {
  type AuthSession,
  createAuthUser,
  deleteAuthUser,
  installBrowserSessionDirect,
  signIn,
} from '../helpers/session-auth';

const apiBase = process.env.E2E_API_URL || 'http://localhost:8008/v1';
const supabaseUrl = process.env.E2E_SUPABASE_URL || 'http://127.0.0.1:54321';
const password = 'E2eOnboardingChat123!';
const api = createApiJsonClient(apiBase);
const authOptions = { supabaseUrl, password };

/** The project home composer's editor. The onboarding chat holds "Onboard me" in it. */
const composerEditor = (page: Parameters<typeof installBrowserSessionDirect>[0]) =>
  page.locator('[contenteditable="true"]').last();

/** The promo's title in the DOM, open or not: a modal behind another one is aria-hidden, so no role query. */
const promoTitle = (page: Parameters<typeof installBrowserSessionDirect>[0]) =>
  page.getByText('Kortix, now on your phone', { exact: true });

interface Provisioned {
  projectId: string;
  /** A managed-git project from `POST /projects/provision`, deleted through the API. */
  provisioned?: boolean;
  accountId: string;
  repository?: LocalGitRepository;
  session: AuthSession;
  userId: string;
  email: string;
  env: Env;
}

/**
 * `realProject`: on a deployed target, fund the account and provision a real
 * managed-git project, as a new user's sign-up does. A database project has no
 * repository, so its first session cannot start and the kickoff never stamps.
 */
async function freshUserWithProject(options: { realProject?: boolean } = {}): Promise<Provisioned> {
  // Two workers reach this line in the same millisecond more often than one
  // would guess, and auth.users enforces the email uniqueness; the UUID suffix
  // keeps the four parallel provisions collision-free.
  const email = `e2e-onboarding-chat-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}@example.test`;
  const user = await createAuthUser(email, authOptions);
  let repository: LocalGitRepository | undefined;
  try {
    const session = await signIn(email, authOptions);
    const account = { account_id: await ensureOwnedAccount(api, session.access_token) };
    // The database fixture stamps `onboarding_completed_at` by default so
    // other journeys land on the usual home; null it here so this fresh
    // project opens on the onboarding chat.
    const env = loadEnv();
    if (options.realProject && isDeployedTarget()) {
      await fundAccount(env.databaseUrl!, account.account_id);
      const real = await api<{ project_id: string }>(
        session.access_token,
        'POST',
        '/projects/provision',
        { account_id: account.account_id, name: `Onboarding chat ${randomUUID().slice(0, 8)}`, seed_starter: true },
        201,
      );
      return { projectId: real.project_id, provisioned: true, accountId: account.account_id, session, userId: user.id, email, env };
    }
    repository = await createLocalGitRepository('Onboarding journey');
    const project = await createDatabaseProject(env, {
      accountId: account.account_id,
      userId: user.id,
      name: `Onboarding chat ${randomUUID().slice(0, 8)}`,
      repoUrl: repository.repoUrl,
      metadata: { onboarding_completed_at: null },
    });
    return { projectId: project.id, accountId: account.account_id, session, userId: user.id, email, env, repository };
  } catch (error) {
    await repository?.dispose();
    await deleteAuthUser(user.id, authOptions);
    throw error;
  }
}

async function cleanup(user: Provisioned) {
  const { env, projectId, userId, email } = user;
  const databaseUrl = env.databaseUrl ?? undefined;
  if (user.provisioned) {
    await api(user.session.access_token, 'DELETE', `/projects/${projectId}`, undefined, [200, 204, 404]).catch(() => undefined);
  } else {
    await deleteDatabaseProject(env, projectId).catch(() => undefined);
    await user.repository?.dispose();
  }
  const rows = await queryDatabaseRows<{ account_id: string }>(
    'select distinct account_id::text from kortix.account_members where user_id = $1::uuid',
    [userId],
    databaseUrl,
  );
  try {
    for (const row of rows) {
      await runDatabaseSql(
        'delete from kortix.accounts where account_id = $1::uuid',
        [row.account_id],
        databaseUrl,
      );
      expect(
        await queryDatabaseRows(
          'select account_id from kortix.accounts where account_id = $1::uuid',
          [row.account_id],
          databaseUrl,
        ),
      ).toEqual([]);
    }
  } finally {
    await deleteAuthUser(userId, authOptions);
  }
  expect(
    await queryDatabaseRows('select id from auth.users where id = $1::uuid', [userId], databaseUrl),
  ).toEqual([]);
}

/** `PATCH /v1/workspaces/:id/onboarding` (the SDK's path; `/projects/` is its legacy alias). */
const isOnboardingWrite = (url: string, projectId: string) =>
  /^\/v1\/(?:workspaces|projects)\/[^/]+\/onboarding$/.test(new URL(url).pathname) &&
  new URL(url).pathname.includes(`/${projectId}/`);

/** The onboarding PATCHes on the wire: `profile` answers, then the `completed` stamp. */
function onboardingWrites(page: Parameters<typeof installBrowserSessionDirect>[0], projectId: string) {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (!isOnboardingWrite(request.url(), projectId)) return;
    const body = request.postDataJSON() as { completed?: boolean; profile?: unknown } | null;
    writes.push(body?.completed === true ? 'completed' : body?.profile ? 'profile' : request.method());
  });
  return writes;
}

const heading = (page: Parameters<typeof installBrowserSessionDirect>[0], name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true });

test.describe('50 — a new project opens on the setup wizard, then the first chat', () => {
  // Model availability comes from the real target: billing-disabled local
  // stacks can expose runnable models even to an unfunded account.
  test('the wizard saves the profile, resumes after a reload, and opens the first chat unsent', async ({
    page,
  }) => {
    test.skip(!process.env.E2E_SUPABASE_URL, 'E2E_SUPABASE_URL is required');
    test.setTimeout(300_000);
    const user = await freshUserWithProject();
    try {
      const writes = onboardingWrites(page, user.projectId);
      // showMobileAppPromo: true lets the promo open if the page allows it.
      // Onboarding owns the screen, so it must not (KRTX-2635).
      await installBrowserSessionDirect(page, user.session, `/workspaces/${user.projectId}`, {
        ...authOptions,
        showMobileAppPromo: true,
      });
      await expect(heading(page, 'Tell Kortix about your team')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('progressbar', { name: 'Step 1 of 4' })).toBeVisible();
      // The wizard owns the screen: no redirect to the first chat, no kickoff.
      expect(new URL(page.url()).searchParams.get('chat')).toBeNull();
      await page.waitForTimeout(3_000);
      await expect(promoTitle(page)).toHaveCount(0);

      await page.getByRole('button', { name: 'Engineering', exact: true }).click();
      await page.getByRole('button', { name: '1-10 people', exact: true }).click();
      const saved = page.waitForResponse(
        (response) =>
          isOnboardingWrite(response.url(), user.projectId) &&
          response.request().postDataJSON()?.profile?.use_case === 'engineering',
      );
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      expect((await saved).status()).toBe(200);
      await expect(heading(page, 'Connect a model')).toBeVisible();
      const ready = page.getByText(/^\d+ models? ready$/);
      const connect = page.getByRole('button', { name: /Connect ChatGPT/ });
      await expect(ready.or(connect)).toBeVisible({ timeout: 30_000 });

      // The saved answer is the server's: a reload resumes past the profile.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(heading(page, 'Connect a model')).toBeVisible({ timeout: 60_000 });
      await expect(ready.or(connect)).toBeVisible({ timeout: 30_000 });
      const modelReady = await ready.isVisible();
      const modelSummary = modelReady ? await ready.innerText() : 'No model connected';
      if (!modelReady) await expect(page.getByRole('button', { name: /Connect Claude/ })).toBeVisible();

      await page.getByRole('button', { name: modelReady ? 'Continue' : 'Skip for now', exact: true }).click();
      await expect(heading(page, 'Bring your tools')).toBeVisible();
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
      await expect(heading(page, 'Review and open your workspace')).toBeVisible();
      await expect(page.getByText('Team profile saved', { exact: true })).toBeVisible();
      await expect(page.getByText(modelSummary, { exact: true })).toBeVisible();
      await expect(page.getByText('No apps connected', { exact: true })).toBeVisible();
      expect(writes).toEqual(['profile']);

      const stamp = page.waitForResponse(
        (response) =>
          isOnboardingWrite(response.url(), user.projectId) &&
          response.request().postDataJSON()?.completed === true,
      );
      await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      expect((await stamp).status()).toBe(200);

      // The first chat opens with the kickoff in the composer, unsent.
      await expect(composerEditor(page)).toHaveText('Onboard me', { timeout: 60_000 });
      await expect(page.getByRole('heading', { level: 1, name: /I'm Kortix\./ })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Your first chat with Kortix' })).toBeVisible();
      await expect.poll(() => new URL(page.url()).searchParams.get('chat')).toBe('first');
      if (!modelReady) await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
      expect(new URL(page.url()).pathname).toBe(`/workspaces/${user.projectId}`);
      expect(writes).toEqual(['profile', 'completed']);

      // Stamped: the next visit is the usual home, never the wizard again.
      await page.goto(`/workspaces/${user.projectId}`);
      await expect(page.getByTestId('workspace-onboarding')).toHaveCount(0);

      // Model setup must not lock the owner out of workspace administration.
      await page.goto(`/workspaces/${user.projectId}/admin/danger-zone`);
      await expect(page.getByRole('button', { name: 'Delete workspace', exact: true })).toBeVisible();
      await expect(page.getByTestId('connect-model-step')).toHaveCount(0);
      await page.goto(`/workspaces/${user.projectId}/admin/api-keys`);
      await expect(page.getByRole('heading', { name: 'API keys', exact: true })).toBeVisible();
      await page.keyboard.press('ControlOrMeta+k');
      const palette = page.getByRole('dialog', { name: 'Command Palette', exact: true });
      await expect(palette.getByRole('combobox')).toBeVisible();
      await expect(palette.getByRole('option', { name: 'Workspace settings', exact: true })).toBeVisible();
    } finally {
      await cleanup(user);
    }
  });

  // With a usable model the wizard says so, and the first chat's kickoff is
  // the person's to send: it opens a session.
  test('with a model: the wizard reads the model as ready and the first send opens a session', async ({
    page,
  }) => {
    test.skip(!process.env.E2E_SUPABASE_URL, 'E2E_SUPABASE_URL is required');
    test.setTimeout(300_000);
    const user = await freshUserWithProject({ realProject: true });
    try {
      // Fund the real account, but still verify this target exposes a runnable model.
      await fundAccount(user.env.databaseUrl!, user.accountId);
      await installBrowserSessionDirect(page, user.session, `/workspaces/${user.projectId}`, authOptions);
      await expect(heading(page, 'Tell Kortix about your team')).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
      const ready = page.getByText(/^\d+ models? ready$/);
      await expect(ready.or(page.getByRole('button', { name: /Connect ChatGPT/ }))).toBeVisible({ timeout: 60_000 });
      test.skip(!(await ready.isVisible()), 'This target exposes no runnable model after funding; real first-send coverage requires one.');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
      const stamp = page.waitForResponse(
        (response) =>
          isOnboardingWrite(response.url(), user.projectId) &&
          response.request().postDataJSON()?.completed === true,
        { timeout: 120_000 },
      );
      await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      expect((await stamp).status()).toBe(200);
      await expect(composerEditor(page)).toHaveText('Onboard me', { timeout: 60_000 });
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/workspaces/${user.projectId}/sessions/`), {
        timeout: 60_000,
      });
      await expect(page.getByText('Onboard me').first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await cleanup(user);
    }
  });

  test('a dismissed promo stays closed across a reload on a promo-eligible project (KRTX-2640)', async ({
    page,
  }) => {
    test.skip(!process.env.E2E_SUPABASE_URL, 'E2E_SUPABASE_URL is required');
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const user = await freshUserWithProject();
    // A SECOND, stamped project: the create flow stamps later projects, so it
    // opens on the usual home — the one surface the promo opens on. The sign-out sweep keeps this dismissal (it is device-scoped,
    // KEEP_STORAGE_KEYS), so a reload — and a fresh sign-in, covered at the
    // sweep's own level in `clear-local-storage.test.ts` — never re-asks.
    let secondProjectId: string | undefined;
    try {
      secondProjectId = (
        await createDatabaseProject(user.env, {
          accountId: user.accountId,
          userId: user.userId,
          name: `Promo eligible ${Date.now().toString(36)}`,
        })
      ).id;
      await installBrowserSessionDirect(page, user.session, `/workspaces/${secondProjectId}`, {
        ...authOptions,
        showMobileAppPromo: true,
      });
      await expect(promoTitle(page)).toBeVisible({ timeout: 30_000 });

      await page
        .getByRole('dialog')
        .filter({ has: promoTitle(page) })
        .getByRole('button', { name: /close/i })
        .first()
        .click();
      await expect(promoTitle(page)).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('kortix.mobileAppPromo'))).toContain(
        '"closed":true',
      );

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3_000);
      await expect(promoTitle(page)).toHaveCount(0);
    } finally {
      if (secondProjectId) {
        await deleteDatabaseProject(user.env, secondProjectId).catch(() => undefined);
      }
      await cleanup(user);
    }
  });
});
