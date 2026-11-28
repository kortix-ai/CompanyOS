/**
 * Integration test (real local PostgreSQL): the fleet count behind the
 * `Kortix/Sessions` `UnreachableActiveBoxes` alarm.
 *
 * Rows are parked by the real writer (`parkPromptForUnreachableRuntime`), so
 * the count and the park agree on `result.delivery_blocked`. Only a box Kortix
 * records as `active` counts: a hibernated box parks prompts in ordinary use.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import {
  type SessionLifecycleCommandRow,
  enqueueContinueSessionCommand,
  parkPromptForUnreachableRuntime,
} from '../projects/session-lifecycle/store';
import {
  countUnreachablePrompts,
  unreachablePromptsMetricLine,
} from '../projects/session-lifecycle/unreachable-prompts';
import { db } from '../shared/db';

const ACCOUNT_ID = crypto.randomUUID();
const PROJECT_ID = crypto.randomUUID();
const AUTHOR = crypto.randomUUID();
/** Two running boxes, one hibernated box, one session with no box row. */
const RUNNING_A = { session: crypto.randomUUID(), sandbox: crypto.randomUUID(), status: 'active' };
const RUNNING_B = { session: crypto.randomUUID(), sandbox: crypto.randomUUID(), status: 'active' };
const SLEEPING = { session: crypto.randomUUID(), sandbox: crypto.randomUUID(), status: 'stopped' };
const NO_BOX = { session: crypto.randomUUID() };
const SESSIONS = [RUNNING_A.session, RUNNING_B.session, SLEEPING.session, NO_BOX.session];

let sequence = 0;
async function enqueue(sessionId: string): Promise<SessionLifecycleCommandRow> {
  sequence += 1;
  const clientMessageId = `q_${sequence}`;
  const { row } = await enqueueContinueSessionCommand({
    source: 'ui',
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    sessionId,
    actorUserId: AUTHOR,
    text: 'say hi',
    idempotencyKey: `prompt:${sessionId}:${clientMessageId}`,
    clientMessageId,
    parts: [{ type: 'text', text: 'say hi' }],
    overrides: { agent: 'build', model: null, variant: null, directory: '/workspace' },
  });
  return row;
}

/** Enqueue a prompt, claim it the way the drain does, and park it as unreachable. */
async function park(sessionId: string): Promise<SessionLifecycleCommandRow> {
  const row = await enqueue(sessionId);
  await db.execute(sql`
    UPDATE kortix.session_lifecycle_commands
       SET status = 'running', locked_by = 'unreachable-prompts-it'
     WHERE command_id = ${row.commandId}::uuid`);
  const parked = await parkPromptForUnreachableRuntime(
    { commandId: row.commandId, lockedBy: 'unreachable-prompts-it' },
    "Couldn't reach the session's machine",
    { sessionId },
  );
  expect(parked.parked).toBe(true);
  return row;
}

async function cleanup() {
  await db
    .execute(sql`DELETE FROM kortix.session_lifecycle_commands WHERE account_id = ${ACCOUNT_ID}::uuid`)
    .catch(() => undefined);
}

beforeAll(async () => {
  await db.execute(sql`
    INSERT INTO kortix.accounts (account_id, name) VALUES (${ACCOUNT_ID}::uuid, 'unreachable-prompts-it')`);
  await db.execute(sql`
    INSERT INTO kortix.projects (project_id, account_id, name, repo_url)
    VALUES (${PROJECT_ID}::uuid, ${ACCOUNT_ID}::uuid, 'unreachable-prompts-it', 'https://example.invalid/r.git')`);
  for (const sessionId of SESSIONS) {
    await db.execute(sql`
      INSERT INTO kortix.project_sessions (session_id, account_id, project_id, branch_name, status)
      VALUES (${sessionId}, ${ACCOUNT_ID}::uuid, ${PROJECT_ID}::uuid, ${`br-${sessionId}`}, 'running')`);
  }
  for (const box of [RUNNING_A, RUNNING_B, SLEEPING]) {
    await db.execute(sql`
      INSERT INTO kortix.session_sandboxes (sandbox_id, session_id, account_id, project_id, status)
      VALUES (${box.sandbox}::uuid, ${box.session}, ${ACCOUNT_ID}::uuid, ${PROJECT_ID}::uuid,
              ${box.status}::kortix.session_sandbox_status)`);
  }
});

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db
    .execute(sql`DELETE FROM kortix.session_sandboxes WHERE account_id = ${ACCOUNT_ID}::uuid`)
    .catch(() => undefined);
  await db
    .execute(sql`DELETE FROM kortix.project_sessions WHERE account_id = ${ACCOUNT_ID}::uuid`)
    .catch(() => undefined);
  await db.execute(sql`DELETE FROM kortix.projects WHERE project_id = ${PROJECT_ID}::uuid`).catch(() => undefined);
  await db.execute(sql`DELETE FROM kortix.accounts WHERE account_id = ${ACCOUNT_ID}::uuid`).catch(() => undefined);
});

describe('countUnreachablePrompts', () => {
  test('nothing parked: zero boxes, zero prompts, even with prompts waiting in the queue', async () => {
    await enqueue(RUNNING_A.session);
    await enqueue(SLEEPING.session);
    expect(await countUnreachablePrompts()).toEqual({ parkedPrompts: 0, activeBoxes: 0 });
  });

  test('a running box counts once however many prompts it holds; a sleeping box and a boxless session count as prompts only', async () => {
    await park(RUNNING_A.session);
    await park(RUNNING_A.session);
    await park(RUNNING_B.session);
    await park(SLEEPING.session);
    await park(NO_BOX.session);
    await enqueue(RUNNING_B.session); // queued, never parked
    expect(await countUnreachablePrompts()).toEqual({ parkedPrompts: 5, activeBoxes: 2 });
  });

  test('a parked prompt that left the queue no longer counts', async () => {
    const delivered = await park(RUNNING_A.session);
    const deadLettered = await park(RUNNING_B.session);
    expect(await countUnreachablePrompts()).toEqual({ parkedPrompts: 2, activeBoxes: 2 });
    // The delivery and dead-letter paths move the row out of `queued`; the
    // `delivery_blocked` mark it carried stays in `result`.
    await db.execute(sql`
      UPDATE kortix.session_lifecycle_commands SET status = 'succeeded'
       WHERE command_id = ${delivered.commandId}::uuid`);
    await db.execute(sql`
      UPDATE kortix.session_lifecycle_commands SET status = 'dead_lettered'
       WHERE command_id = ${deadLettered.commandId}::uuid`);
    expect(await countUnreachablePrompts()).toEqual({ parkedPrompts: 0, activeBoxes: 0 });
  });

  test('a box that comes back as stopped stops counting while its prompt stays parked', async () => {
    await park(RUNNING_A.session);
    expect((await countUnreachablePrompts()).activeBoxes).toBe(1);
    await db.execute(sql`
      UPDATE kortix.session_sandboxes SET status = 'stopped' WHERE sandbox_id = ${RUNNING_A.sandbox}::uuid`);
    try {
      expect(await countUnreachablePrompts()).toEqual({ parkedPrompts: 1, activeBoxes: 0 });
    } finally {
      await db.execute(sql`
        UPDATE kortix.session_sandboxes SET status = 'active' WHERE sandbox_id = ${RUNNING_A.sandbox}::uuid`);
    }
  });
});

describe('unreachablePromptsMetricLine', () => {
  test('is the one JSON line the CloudWatch filter reads', () => {
    expect(JSON.parse(unreachablePromptsMetricLine({ parkedPrompts: 7, activeBoxes: 3 }, 'prod'))).toEqual({
      kortix_metric: 'prompt_delivery',
      environment: 'prod',
      unreachable_active_boxes: 3,
      parked_prompts: 7,
    });
  });
});
