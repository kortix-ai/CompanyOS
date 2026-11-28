import { afterAll, beforeAll, expect, test } from 'bun:test';
import { accounts, projects, projectSessions, sessionSandboxes, accountMembers } from '@kortix/db';
import { eq } from 'drizzle-orm';
import { db } from '../shared/db';
import { loadProjectSessionInventory } from '../projects/lib/session-list';

const accountId = crypto.randomUUID();
const foreignAccount = crypto.randomUUID();
const projectId = crypto.randomUUID();
const foreignProject = crypto.randomUUID();
const userId = crypto.randomUUID();
const other = crypto.randomUUID();
const own = crypto.randomUUID();
const unrelated = Array.from({ length: 5 }, () => crypto.randomUUID());
const foreign = crypto.randomUUID();

beforeAll(async () => {
  await db.insert(accounts).values([accountId, foreignAccount].map((accountId) => ({ accountId, name: 'synthetic inventory' })));
  await db.insert(projects).values([projectId, foreignProject].map((projectId) => ({ projectId, accountId: projectId === foreignProject ? foreignAccount : accountId, name: 'synthetic', repoUrl: 'https://example.com/synthetic.git' })));
  await db.insert(projectSessions).values([own, ...unrelated, foreign].map((sessionId, index): typeof projectSessions.$inferInsert => ({
    sessionId, projectId: sessionId === foreign ? foreignProject : projectId, accountId: sessionId === foreign ? foreignAccount : accountId,
    branchName: sessionId, createdBy: sessionId === own ? userId : other, visibility: 'private',
    updatedAt: new Date(Date.now() - index * 1000), metadata: { first_prompt: 'synthetic private prompt' },
  })));
});
afterAll(async () => {
  await db.delete(accounts).where(eq(accounts.accountId, accountId));
  await db.delete(accounts).where(eq(accounts.accountId, foreignAccount));
});

const list = (canListSessions: boolean, cursor: string | null = null) => loadProjectSessionInventory({
  accountId, projectId, userId, scope: 'visible', boundCredentialSessionId: own,
  agentPrincipal: true, canListSessions, probeManageCapability: async () => false,
  limit: 2, cursor,
});

test('inventory grant pages unrelated sessions without content access or foreign project leakage', async () => {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const result = await list(true, cursor);
    for (const item of result.items) {
      ids.push(item.row.sessionId);
      if (item.row.sessionId !== own) expect(item.canAccess).toBe(false);
    }
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  expect(cursor).toBeNull();
  expect(ids).toEqual([own, ...unrelated]);
  expect(ids).not.toContain(foreign);
  expect((await list(false)).items.map(({ row }) => row.sessionId)).toEqual([own]);
});

test('HTTP agent caller can list, but cannot read transcripts, write, or cross workspace', async () => {
  const { insertIntoView } = await import('./helpers/compat-views');
  await insertIntoView(db, accountMembers, { userId, accountId, accountRole: 'member' });
  const { app } = await import('../index');
  const { createAccountToken } = await import('../repositories/account-tokens');
  const { ensureAgentServiceAccount } = await import('../repositories/service-accounts');
  const serviceAccountId = await ensureAgentServiceAccount({ accountId, projectId, agentName: 'observer' });
  const token = await createAccountToken({
    accountId, userId, projectId, serviceAccountId, sessionId: own, name: 'synthetic inventory observer',
    agentGrant: { agent: 'observer', permissions: ['project.session.list'], connectors: [] },
  });
  await db.insert(sessionSandboxes).values({ sandboxId: own, sessionId: own, accountId, projectId, status: 'active', config: {}, metadata: {} });
  await db.update(projectSessions).set({ status: 'running', origin: 'backend' }).where(eq(projectSessions.sessionId, own));
  const headers = { Authorization: `Bearer ${token.secretKey}` };
  await db.update(projectSessions).set({ labels: ['synthetic-confidential-topic'] }).where(eq(projectSessions.sessionId, unrelated[0]));
  await db.update(projectSessions).set({ labels: ['synthetic-visible-topic'] }).where(eq(projectSessions.sessionId, own));
  for (const suffix of ['', '&parent=root', `&parent=${own}`]) {
    const filtered = await app.request(`/v1/projects/${projectId}/sessions?label=synthetic-confidential-topic${suffix}`, { headers });
    expect(filtered.status).toBe(200);
    expect(await filtered.json()).toEqual([]);
  }
  // An accessible root must not reveal a private child's label either.
  await db.update(projectSessions).set({ parentSessionId: own }).where(eq(projectSessions.sessionId, unrelated[0]));
  for (const suffix of ['&parent=root', `&parent=${own}`]) {
    const filtered = await app.request(`/v1/projects/${projectId}/sessions?label=synthetic-confidential-topic${suffix}`, { headers });
    expect(filtered.status).toBe(200);
    expect(await filtered.json()).toEqual([]);
  }
  const visible = await app.request(`/v1/projects/${projectId}/sessions?label=synthetic-visible-topic&parent=root`, { headers });
  expect(visible.status).toBe(200);
  expect((await visible.json()).map((row: { session_id: string }) => row.session_id)).toEqual([own]);
  // A child-only prompt must not make an accessible root match.
  await db.update(projectSessions).set({ metadata: { first_prompt: 'synthetic-child-only-secret' } }).where(eq(projectSessions.sessionId, unrelated[0]));
  const hiddenChild = await app.request(`/v1/projects/${projectId}/sessions?q=synthetic-child-only-secret&parent=root`, { headers });
  expect(hiddenChild.status).toBe(200);
  expect(await hiddenChild.json()).toEqual([]);
  // A readable child still makes its root match, even when the root lacks the label.
  const readableChild = crypto.randomUUID();
  await db.insert(projectSessions).values({
    sessionId: readableChild, accountId, projectId, branchName: readableChild,
    parentSessionId: own, visibility: 'private', createdBy: userId,
    metadata: { spawned_by_session: own }, labels: ['synthetic-child-topic'],
  });
  const childMatch = await app.request(`/v1/projects/${projectId}/sessions?label=synthetic-child-topic&parent=root`, { headers });
  expect(childMatch.status).toBe(200);
  expect((await childMatch.json()).map((row: { session_id: string }) => row.session_id)).toEqual([own]);
  await db.delete(projectSessions).where(eq(projectSessions.sessionId, readableChild));
  await db.update(projectSessions).set({ parentSessionId: null }).where(eq(projectSessions.sessionId, unrelated[0]));

  const response = await app.request(`/v1/projects/${projectId}/sessions?limit=2`, { headers });
  if (response.status !== 200) throw new Error(`List returned ${response.status}: ${await response.text()}`);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.map((row: { session_id: string }) => row.session_id)).toEqual([own, unrelated[0]]);
  expect(body[1]).toMatchObject({ can_access: false, name: null, first_prompt: null, metadata: {} });
  const cursor = response.headers.get('X-Next-Cursor');
  expect(cursor).toBeTruthy();
  const page = await app.request(`/v1/projects/${projectId}/sessions?limit=2&cursor=${encodeURIComponent(cursor ?? '')}`, { headers });
  expect(page.status).toBe(200);
  expect((await page.json()).map((row: { session_id: string }) => row.session_id)).toEqual(unrelated.slice(1, 3));
  for (const path of [`/v1/projects/${foreignProject}/sessions`, `/v1/projects/${projectId}/sessions/${unrelated[0]}/log`]) {
    expect((await app.request(path, { headers })).status).toBe(403);
  }
  expect((await app.request(`/v1/projects/${projectId}/sessions/${unrelated[0]}`, { method: 'DELETE', headers })).status).toBe(403);
  const denied = await createAccountToken({ accountId, userId, projectId, serviceAccountId, sessionId: own, name: 'synthetic denied observer', agentGrant: { agent: 'observer', permissions: [], connectors: [] } });
  expect((await app.request(`/v1/projects/${projectId}/sessions`, { headers: { Authorization: `Bearer ${denied.secretKey}` } })).status).toBe(403);
});
