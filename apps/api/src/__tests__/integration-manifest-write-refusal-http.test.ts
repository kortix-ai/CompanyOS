/**
 * A config write that would add a validation error to kortix.yaml answers
 * 409 `manifest_invalid` with the issues, through the real routes (in-process
 * app, real DB, real git), and commits nothing:
 * PATCH /triggers/:slug commits through the compare-and-swap retry
 * (`mutateManifestWithRetry` → `commitManifest`), the path of every trigger,
 * connector, App and agent-scope write.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { eq, sql } from 'drizzle-orm';
import { accountMembers, accounts, projectMembers, projects } from '@kortix/db';
import { db } from '../shared/db';
import { app } from '../index';
import { createAccountToken } from '../repositories/account-tokens';
import { insertIntoView } from './helpers/compat-views';
import { createLocalGitUpstream, type LocalGitUpstream } from './helpers/local-git-upstream';

const MANIFEST = `default_agent: support
project:
  name: manifest-write-refusal
agents:
  support:
    tools: "*"
triggers:
  - slug: nightly
    type: cron
    cron: "0 3 * * *"
    agent: support
    prompt: Run the nightly check.
`;

const ACCOUNT = crypto.randomUUID();
const OWNER = crypto.randomUUID();
const PROJECT = crypto.randomUUID();
let upstream: LocalGitUpstream;
let secret = '';

beforeAll(async () => {
  // The routes commit with the git CLI to the local bare upstream, no token.
  process.env.KORTIX_LOCAL_DEV = '1';
  await db.insert(accounts).values({ accountId: ACCOUNT, name: 'manifest-write-refusal-test' });
  await insertIntoView(db, accountMembers, [{ userId: OWNER, accountId: ACCOUNT, accountRole: 'owner', isSuperAdmin: false }]);
  upstream = createLocalGitUpstream('manifest-write-refusal', { 'kortix.yaml': MANIFEST });
  await db.insert(projects).values({ projectId: PROJECT, accountId: ACCOUNT, name: 'manifest-write-refusal', repoUrl: upstream.repoUrl });
  await insertIntoView(db, projectMembers, [{ accountId: ACCOUNT, projectId: PROJECT, userId: OWNER, projectRole: 'manager' }]);
  secret = (await createAccountToken({ accountId: ACCOUNT, userId: OWNER, projectId: PROJECT, name: 'manifest-write-refusal' })).secretKey;
});

afterAll(async () => {
  await db.execute(sql`delete from kortix.account_tokens where account_id = ${ACCOUNT}`);
  await db.delete(projects).where(eq(projects.accountId, ACCOUNT));
  await db.delete(accounts).where(eq(accounts.accountId, ACCOUNT));
  upstream.remove();
});

const head = () => execFileSync('git', ['--git-dir', upstream.repoUrl, 'rev-parse', 'main'], { encoding: 'utf8' }).trim();
const committed = () => execFileSync('git', ['--git-dir', upstream.repoUrl, 'show', 'main:kortix.yaml'], { encoding: 'utf8' });

const call = (path: string, method: string, body: unknown) =>
  app.request(`/v1/projects/${PROJECT}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('a config write that adds a validation error is refused with the issues', () => {
  test('PATCH /triggers/:slug to an undeclared agent: 409 manifest_invalid with the issues, nothing committed', async () => {
    const before = head();
    // The route checks the trigger itself; only the manifest validator knows `ghost` is no declared agent.
    const res = await call('triggers/nightly', 'PATCH', { agent: 'ghost' });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: 'manifest_invalid',
      error: expect.stringContaining('triggers[0].agent'),
      issue_count: 1,
      issues: [{ path: 'triggers[0].agent', severity: 'error', message: expect.stringContaining('agent "ghost" does not match any declared agent') }],
    });
    expect(head()).toBe(before);
    expect(committed()).toBe(MANIFEST);
  });

  test('the same PATCH to a declared agent commits', async () => {
    const res = await call('triggers/nightly', 'PATCH', { agent: 'support', prompt_template: 'Run the nightly check now.' });

    expect(res.status).toBe(200);
    expect(committed()).toContain('prompt: Run the nightly check now.');
  });
});
