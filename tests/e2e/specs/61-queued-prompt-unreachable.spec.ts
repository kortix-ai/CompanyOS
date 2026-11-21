import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { loadEnv } from "../../src/core/env";
import {
  createDatabaseSession,
  seedDatabaseParkedPrompt,
  seedDatabaseRunningFirstPrompt,
} from "../../src/fixtures/database-project";
import { ensureOwnedAccount } from "../helpers/accounts";
import { createApiJsonClient } from "../helpers/http";
import { createManifestProject, fundAccount, type ManifestProject } from "../helpers/manifest-project";
import { createAuthUser, deleteAuthUser, installBrowserSessionDirect, signIn } from "../helpers/session-auth";
import { dismissOnboarding, dismissWelcomeCard } from "../helpers/ui";

/**
 * A prompt that could not reach the session's machine says why it waits.
 * When the machine does not answer, the drain parks the prompt and re-sends it
 * on its own backoff (30 s, 2 min, 8 min). The waiting row looked like any
 * other queued message, so a person could not tell a parked prompt from one
 * waiting for the agent (2026-11-11: up to 9 min on 2 Platinum hosts).
 */

const apiBase = process.env.E2E_API_URL || "http://localhost:8008/v1";
const authOptions = {
  supabaseUrl: process.env.E2E_SUPABASE_URL || "http://127.0.0.1:54321",
  password: "E2eQueuedUnreachable123!",
};
const api = createApiJsonClient(apiBase);
const PARKED_TEXT = "Summarize the failed deploys";
const UNREACHABLE_LINE = "Waits for the session's machine to answer. Kortix keeps retrying.";

test("61 — a prompt parked on an unreachable machine says why it waits", async ({ page }) => {
  test.setTimeout(240_000);
  const env = loadEnv();
  if (!env.databaseUrl) throw new Error("KE2E_DATABASE_URL is required");
  const runId = randomUUID();
  const user = await createAuthUser(`e2e-queued-unreachable-${runId}@example.test`, authOptions);
  let project: ManifestProject | undefined;

  try {
    const auth = await signIn(user.email!, authOptions);
    const accountId = await ensureOwnedAccount(api, auth.access_token);
    await fundAccount(env.databaseUrl, accountId);
    project = await createManifestProject({
      api,
      accessToken: auth.access_token,
      accountId,
      userId: user.id,
      name: `Queued unreachable ${Date.now()}`,
      databaseUrl: env.databaseUrl,
    });
    const projectId = project.id;
    const sessionId = await createDatabaseSession(env, { projectId, accountId, userId: user.id });
    // The first prompt is on its way, so the page opens on the boot shell and no
    // computer boots; the second could not reach the machine and is parked.
    await seedDatabaseRunningFirstPrompt(env, { projectId, sessionId, accountId, userId: user.id });
    await seedDatabaseParkedPrompt(env, { projectId, sessionId, accountId, userId: user.id, text: PARKED_TEXT });

    await test.step("the API reports the parked prompt as queued, waiting on the machine", async () => {
      const prompts = await api<{ prompts: { text: string; state: string; reason: string | null }[] }>(
        auth.access_token,
        "GET",
        `/projects/${projectId}/sessions/${sessionId}/prompts`,
      );
      expect(prompts.prompts.find((p) => p.text === PARKED_TEXT)).toMatchObject({
        state: "queued",
        reason: "runtime_unreachable",
      });
    });

    // The computer stays in boot: the queue under test is the boot shell's.
    await page.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (/^\/v1\/projects\/[^/]+\/sessions\/[^/]+\/start$/.test(path)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            stage: "provisioning",
            agent_name: "kortix",
            retriable: true,
            sandbox: null,
            runtime_session_id: null,
            failure: null,
          }),
        });
        return;
      }
      await route.continue();
    });
    await installBrowserSessionDirect(page, auth, `/workspaces/${projectId}`, authOptions);

    await test.step("the waiting row shows the prompt and why it waits", async () => {
      await page.goto(`/workspaces/${projectId}/sessions/${sessionId}`);
      await dismissOnboarding(page);
      await expect(page.getByRole("textbox", { name: "Message input" })).toBeVisible({ timeout: 60_000 });
      await dismissWelcomeCard(page);
      const row = page.locator("[data-queued-prompt-id]").filter({ hasText: PARKED_TEXT });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(row.locator("[data-queued-unreachable]")).toHaveText(UNREACHABLE_LINE);
      await expect(page.locator("[data-queued-unreachable]")).toHaveCount(1);
      // Every prompt is served as steer; a parked one waits for the machine, not the turn.
      await expect(page.getByText("Read at next step")).toHaveCount(0);
    });
  } finally {
    try {
      if (project) await project.dispose();
    } finally {
      await deleteAuthUser(user.id, authOptions);
    }
  }
});
