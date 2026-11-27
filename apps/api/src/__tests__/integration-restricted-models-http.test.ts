import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { accountMembers, accounts, platformUserRoles, projectMembers, projects } from '@kortix/db';
import { db } from '../shared/db';
import { getProjectGatewayResolution } from '../repositories/project-model-access';
import { app } from '../index';
import { createAccountToken } from '../repositories/account-tokens';
import { insertIntoView } from './helpers/compat-views';

// PUT /v1/admin/api/projects/:id/restricted-models against the real DB: the one
// way a project reaches a restricted managed model (llm-gateway/restricted-models.ts,
// the abliterated models). A workspace manager cannot write it; an operator can,
// and the gateway's per-request read (getProjectGatewayResolution) sees the grant.
const ACCOUNT = crypto.randomUUID();
const PROJECT = crypto.randomUUID();
const ARCHIVED = crypto.randomUUID();
const MANAGER = crypto.randomUUID();
/** A project member who is also a platform operator (kortix.platform_user_roles). */
const OPERATOR = crypto.randomUUID();

const minted: string[] = [];
let secret = '';
let operatorSecret = '';

beforeAll(async () => {
  await db.execute(sql`alter table kortix.account_tokens add column if not exists agent_grant jsonb`);
  await db.execute(sql`alter table kortix.account_tokens add column if not exists session_id text`);
  await db.execute(
    sql`alter table kortix.account_tokens add column if not exists service_account_id uuid`,
  );

  await db.insert(accounts).values({ accountId: ACCOUNT, name: 'restricted-models-test' });
  await db.insert(projects).values([
    {
      projectId: PROJECT,
      accountId: ACCOUNT,
      name: 'restricted-models-test-project',
      repoUrl: 'https://example.com/restricted-models.git',
    },
    {
      projectId: ARCHIVED,
      accountId: ACCOUNT,
      name: 'restricted-models-archived-project',
      repoUrl: 'https://example.com/restricted-models-archived.git',
      status: 'archived',
      metadata: { restricted_models: ['deepseek-v4.1-flash-abliterated'] },
    },
  ]);
  await insertIntoView(db, accountMembers, [
    { userId: MANAGER, accountId: ACCOUNT, accountRole: 'member', isSuperAdmin: false },
    { userId: OPERATOR, accountId: ACCOUNT, accountRole: 'member', isSuperAdmin: false },
  ]);
  await insertIntoView(db, projectMembers, [
    { accountId: ACCOUNT, projectId: PROJECT, userId: MANAGER, projectRole: 'manager' },
    { accountId: ACCOUNT, projectId: PROJECT, userId: OPERATOR, projectRole: 'manager' },
    { accountId: ACCOUNT, projectId: ARCHIVED, userId: MANAGER, projectRole: 'manager' },
  ]);

  // Account-scoped (no projectId): a project-scoped token is rejected by the
  // auth middleware before the handler when it addresses a different project,
  // and this suite must reach the handler for BOTH projects.
  const token = await createAccountToken({
    accountId: ACCOUNT,
    userId: MANAGER,
    name: 'restricted-models-test',
  });
  minted.push(token.tokenId);
  secret = token.secretKey;

  await db.insert(platformUserRoles).values({ accountId: OPERATOR, role: 'admin' });
  const operatorToken = await createAccountToken({
    accountId: ACCOUNT,
    userId: OPERATOR,
    name: 'restricted-models-operator',
  });
  minted.push(operatorToken.tokenId);
  operatorSecret = operatorToken.secretKey;
});

afterAll(async () => {
  for (const tokenId of minted) {
    await db.execute(sql`delete from kortix.account_tokens where token_id = ${tokenId}`);
  }
  await db.delete(platformUserRoles).where(eq(platformUserRoles.accountId, OPERATOR));
  await db.delete(projects).where(eq(projects.accountId, ACCOUNT));
  await db.delete(accounts).where(eq(accounts.accountId, ACCOUNT));
});

function put(projectId: string, body: unknown, bearer: string) {
  return app.request(`/v1/admin/api/projects/${projectId}/restricted-models`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function stored(projectId: string): Promise<unknown> {
  const [row] = await db.select({ metadata: projects.metadata }).from(projects).where(eq(projects.projectId, projectId)).limit(1);
  return (row?.metadata as { restricted_models?: unknown } | null)?.restricted_models;
}

describe('PUT /v1/admin/api/projects/:id/restricted-models', () => {
  test('a workspace manager gets 403 and nothing is stored', async () => {
    const res = await put(PROJECT, { models: ['kimi-k3.1-pro-abliterated'] }, secret);
    expect(res.status).toBe(403);
    expect(await stored(PROJECT)).toBeUndefined();
    expect((await getProjectGatewayResolution(PROJECT)).restrictedModels).toEqual([]);
  });

  test('an operator turns one on and the gateway reads it; a non-restricted id 400; [] turns all off', async () => {
    const on = await put(PROJECT, { models: ['kimi-k3.1-pro-abliterated', 'kimi-k3.1-pro-abliterated'] }, operatorSecret);
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ project_id: PROJECT, models: ['kimi-k3.1-pro-abliterated'] });
    expect(await stored(PROJECT)).toEqual(['kimi-k3.1-pro-abliterated']);
    expect((await getProjectGatewayResolution(PROJECT)).restrictedModels).toEqual(['kimi-k3.1-pro-abliterated']);

    const bad = await put(PROJECT, { models: ['kimi-k3.1-pro'] }, operatorSecret);
    expect(bad.status).toBe(400);
    expect(await stored(PROJECT)).toEqual(['kimi-k3.1-pro-abliterated']);

    const off = await put(PROJECT, { models: [] }, operatorSecret);
    expect(off.status).toBe(200);
    expect(await stored(PROJECT)).toEqual([]);
    expect((await getProjectGatewayResolution(PROJECT)).restrictedModels).toEqual([]);
  });

  test('an unknown or archived project is 404 and keeps what it had', async () => {
    expect((await put(crypto.randomUUID(), { models: [] }, operatorSecret)).status).toBe(404);
    expect((await put(ARCHIVED, { models: [] }, operatorSecret)).status).toBe(404);
    expect(await stored(ARCHIVED)).toEqual(['deepseek-v4.1-flash-abliterated']);
  });
});
