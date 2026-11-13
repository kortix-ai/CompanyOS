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

  const fill = (n: number, expires: string) => db.execute(sql`
    INSERT INTO kortix.gateway_idempotency_replays (key_hash, status, status_text, headers, body, expires_at)
    SELECT md5(i::text) || md5((i + 1)::text), 200, 'OK', '[]'::jsonb, '{}', ${expires}::timestamptz
    FROM generate_series(1, ${n}) AS i`);
  const rows = async () => Number(((await db.execute(sql`SELECT count(*)::int AS n FROM kortix.gateway_idempotency_replays`)) as unknown as { n: number }[])[0].n);

  test('one write reclaims a bounded batch of expired rows, not the whole backlog', async () => {
    await fill(250, '2000-01-01T00:00:00Z');
    await putReplay(key, answer);
    expect(await rows()).toBe(250 - 200 + 1);
  });

  test('past the live-row ceiling the answer is not stored', async () => {
    await fill(10_000, '2999-01-01T00:00:00Z');
    await putReplay(key, answer);
    expect(await getReplay(key)).toBeNull();
    expect(await rows()).toBe(10_000);
  });
});
