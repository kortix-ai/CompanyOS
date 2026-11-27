import { expect } from '@playwright/test';
import { loadEnv } from '../../../src/core/env';
import { createDatabaseSession } from '../../../src/fixtures/database-project';
import { runDatabaseSql } from '../database';
import { installBrowserSessionDirect } from '../session-auth';
import { dismissOnboarding } from '../ui';
import { authOptions, desktopDatabaseUrl, provisionDesktopScene, resize, test } from './fixture';

export function defineSessionChildrenParity(): void {
  test('a parent collapses while its runtime child is open and expands from the keyboard', async ({ page, baseURL, desktopApp }) => {
    test.setTimeout(180_000);
    await resize(page, desktopApp, 1440, 900);
    const databaseUrl = desktopDatabaseUrl();
    const { user, session, accounts, project, dispose } = await provisionDesktopScene({
      databaseUrl, emailPrefix: 'e2e-session-tree', name: 'Session tree',
    });
    try {
      const create = (name: string, parentSessionId?: string) => createDatabaseSession(loadEnv(), {
        projectId: project.id, accountId: accounts[0].account_id, userId: user.id,
        metadata: { custom_name: name }, parentSessionId,
      });
      const alpha = await create('Parent Alpha');
      const beta = await create('Parent Beta');
      await create('Independent session');
      await create('Alpha child one', alpha);
      await create('Alpha child two', alpha);
      await create('Beta child one', beta);
      for (const id of [alpha, beta]) {
        await runDatabaseSql(
          "UPDATE kortix.project_sessions SET runtime_session_id = $2, metadata = metadata || $3::jsonb WHERE session_id = $1",
          [id, `root-${id}`, JSON.stringify({ runtime_sessions: [
            { id: `root-${id}`, title: 'Parent' },
            { id: `child-${id}`, parent_id: `root-${id}`, title: 'Runtime child' },
          ] })], databaseUrl,
        );
      }
      await runDatabaseSql("UPDATE kortix.project_sessions SET status = 'stopped' WHERE project_id = $1::uuid", [project.id], databaseUrl);
      const url = `${baseURL}/workspaces/${project.id}/sessions/${alpha}?rs=child-${alpha}`;
      await installBrowserSessionDirect(page, session, url, authOptions);
      await dismissOnboarding(page);
      const alphaRow = page.getByRole('link', { name: 'Parent Alpha', exact: true });
      const betaRow = page.getByRole('link', { name: 'Parent Beta', exact: true });
      const alphaToggle = alphaRow.locator('[data-session-children-toggle]');
      const betaToggle = betaRow.locator('[data-session-children-toggle]');
      const alphaChildren = page.locator(`[data-session-children="${alpha}"]`);
      const betaChildren = page.locator(`[data-session-children="${beta}"]`);
      await expect(alphaToggle).toHaveAttribute('aria-expanded', 'true');
      await betaToggle.click();
      await expect(betaChildren.getByRole('link', { name: 'Beta child one', exact: true })).toBeVisible();
      await expect(alphaChildren.getByRole('link', { name: 'Alpha child two', exact: true })).toBeVisible();
      await alphaToggle.click();
      await expect(alphaToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(alphaChildren).toHaveCount(0);
      await expect(alphaRow).toBeVisible();
      await expect(betaRow).toBeVisible();
      await expect(betaChildren).toBeVisible();
      await expect(page.getByRole('link', { name: 'Independent session', exact: true })).toBeVisible();
      await expect(page).toHaveURL(url);
      await alphaToggle.focus();
      await page.keyboard.press('Enter');
      await expect(alphaChildren.getByRole('link', { name: 'Alpha child one', exact: true })).toBeVisible();
      await page.keyboard.press('Space');
      await expect(alphaChildren).toHaveCount(0);
      await page.keyboard.press('Enter');
      const child = alphaChildren.getByRole('link', { name: 'Alpha child one', exact: true });
      await expect(child).toHaveAttribute('href', /\/sessions\/[^/?]+$/);
      await child.click();
      await expect(page).toHaveURL(/\/sessions\/[^/?]+$/);
    } finally {
      await dispose();
    }
  });
}
