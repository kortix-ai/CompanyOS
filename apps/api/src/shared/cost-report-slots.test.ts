import { describe, expect, test } from 'bun:test';
import { DEFAULT_DB_POOL_MAX } from '@kortix/db/connection-defaults';
import { HTTPException } from 'hono/http-exception';
import { MAX_COST_REPORTS_PER_REPLICA, withCostReportSlot } from './cost-report-slots';

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

describe('withCostReportSlot', () => {
  test('refuses a report past the per-replica cap with a 429 and Retry-After', async () => {
    const g = gate();
    const held = Array.from({ length: MAX_COST_REPORTS_PER_REPLICA }, () => withCostReportSlot(() => g.opened));
    const refused = await withCostReportSlot(async () => 'ran').catch((e) => e);
    expect(refused).toBeInstanceOf(HTTPException);
    expect((refused as HTTPException).status).toBe(429);
    expect((refused as HTTPException).getResponse().headers.get('Retry-After')).toBe('5');
    g.open();
    await Promise.all(held);
  });

  test('the cap fits the connection pool: one report fans out to 4 queries, the pool is 6', () => {
    expect(MAX_COST_REPORTS_PER_REPLICA * 4).toBeLessThanOrEqual(DEFAULT_DB_POOL_MAX);
  });

  test('a slot frees when the work settles, success or failure', async () => {
    for (let i = 0; i < MAX_COST_REPORTS_PER_REPLICA * 6; i++) {
      await withCostReportSlot(async () => {
        if (i % 2) throw new Error('boom');
      }).catch(() => undefined);
    }
    expect(await withCostReportSlot(async () => 'ran')).toBe('ran');
  });
});
