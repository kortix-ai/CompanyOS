/**
 * The tool call log service against real Postgres (`listToolCalls`).
 *
 * - A member sees the calls they made and the calls of sessions they can
 *   open; another person's call outside any session stays hidden.
 * - Keyset pages chain with no repeat and no gap, also across rows whose
 *   `created_at` differ only in microseconds (a millisecond cursor would skip
 *   or repeat them).
 * - A session-bound credential sees only its own session's calls.
 * - No row carries `result_summary` or `request_digest`.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectorCalls } from '@kortix/db';
import { eq, sql } from 'drizzle-orm';
import { listToolCalls } from '../projects/lib/tool-call-log';
import { loadProjectRow } from '../projects/lib/project-access';
import { db } from '../shared/db';
import { removeSeeded, seedProject, seedSession, type SeededProject } from './helpers/integration-fixtures';

const owner = crypto.randomUUID();
const member = crypto.randomUUID();
let seeded: SeededProject;
let memberSession = '';
let ownerSession = '';
const SECRET = 'tool-call-log-summary-secret-3307';

async function insertCall(values: { actingUserId: string; sessionId: string | null; at: string; action: string }) {
  await db.insert(connectorCalls).values({
    accountId: seeded.account_id,
    projectId: seeded.project_id,
    actionPath: values.action,
    actingUserId: values.actingUserId,
    sessionId: values.sessionId,
    status: 'ok',
    risk: 'read',
    resultSummary: { note: SECRET },
    requestDigest: 'digest-not-for-the-list',
    surface: 'api',
    phase: 'done',
    createdAt: sql`${values.at}::timestamptz` as unknown as Date,
  });
}

beforeAll(async () => {
  seeded = await seedProject('tool-call-log');
  memberSession = await seedSession(seeded, member);
  ownerSession = await seedSession(seeded, owner);
  // Five calls inside one millisecond, apart by microseconds: the member's.
  for (let i = 0; i < 5; i += 1) {
    await insertCall({ actingUserId: member, sessionId: null, at: `2026-11-11T10:00:00.000${i}00Z`, action: `echo.mine_${i}` });
  }
  // Calls the owner made in the member's own session: the member can open it.
  for (let i = 0; i < 2; i += 1) {
    await insertCall({ actingUserId: owner, sessionId: memberSession, at: `2026-11-11T09:00:0${i}.000000Z`, action: `echo.in_my_session_${i}` });
  }
  // The owner's calls outside any session and in the owner's private session.
  await insertCall({ actingUserId: owner, sessionId: null, at: '2026-11-11T08:00:00.000000Z', action: 'echo.owner_loose' });
  await insertCall({ actingUserId: owner, sessionId: ownerSession, at: '2026-11-11T08:00:01.000000Z', action: 'echo.owner_private' });
});

afterAll(async () => {
  await db.delete(connectorCalls).where(eq(connectorCalls.projectId, seeded.project_id));
  await removeSeeded([seeded]);
});

async function memberLoaded() {
  const row = await loadProjectRow(seeded.project_id);
  if (!row) throw new Error('seeded project missing');
  return { row, userId: member, actor: null };
}

test('a member pages through their own calls and the calls of sessions they can open, nothing else', async () => {
  const loaded = await memberLoaded();
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const result = await listToolCalls({ loaded, boundSessionId: null, filter: {}, limit: 2, cursor });
    seen.push(...result.rows.map((r) => r.action_path));
    for (const row of result.rows) {
      expect(row).not.toHaveProperty('result_summary');
      expect(row).not.toHaveProperty('request_digest');
      expect(JSON.stringify(row)).not.toContain(SECRET);
    }
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  expect(seen).toEqual([
    'echo.mine_4',
    'echo.mine_3',
    'echo.mine_2',
    'echo.mine_1',
    'echo.mine_0',
    'echo.in_my_session_1',
    'echo.in_my_session_0',
  ]);
});

test('a session-bound credential sees only its own session', async () => {
  const loaded = await memberLoaded();
  const result = await listToolCalls({ loaded, boundSessionId: memberSession, filter: {}, limit: 50, cursor: null });
  expect(result.rows.map((r) => r.action_path)).toEqual(['echo.in_my_session_1', 'echo.in_my_session_0']);
  expect(result.nextCursor).toBeNull();
});

test('the connector filter matches the slug literally', async () => {
  const loaded = await memberLoaded();
  const none = await listToolCalls({ loaded, boundSessionId: null, filter: { connector: 'ec%' }, limit: 50, cursor: null });
  expect(none.rows).toEqual([]);
  const all = await listToolCalls({ loaded, boundSessionId: null, filter: { connector: 'echo' }, limit: 50, cursor: null });
  expect(all.rows).toHaveLength(7);
});
