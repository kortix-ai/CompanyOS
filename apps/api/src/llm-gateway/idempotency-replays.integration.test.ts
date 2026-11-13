import { beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '../shared/db';
import { getReplay, putReplay } from './idempotency-replays';

const key = 'cd'.repeat(32);
const answer = { status: 200, statusText: 'OK', headers: [['content-type', 'application/json']] as [string, string][], body: '{"id":"cmpl-1"}' };

describe('gateway Idempotency-Key replay on PostgreSQL (KRTX-4612)', () => {
  beforeEach(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
    await db.execute(sql`DELETE FROM kortix.gateway_idempotency_replays`);
  });

  test('a stored answer is read back byte for byte; the first writer wins', async () => {
    expect(await getReplay(key)).toBeNull();
    await putReplay(key, answer);
    await putReplay(key, { ...answer, body: '{"id":"cmpl-2"}' });
    expect(await getReplay(key)).toEqual(answer);
  });

  test('an expired answer is not served, and the next write replaces it', async () => {
    await putReplay(key, answer, new Date(Date.now() - 2 * 60 * 60 * 1000));
    expect(await getReplay(key)).toBeNull();
    await putReplay(key, { ...answer, body: '{"id":"cmpl-3"}' });
    expect(await getReplay(key)).toEqual({ ...answer, body: '{"id":"cmpl-3"}' });
  });
});
