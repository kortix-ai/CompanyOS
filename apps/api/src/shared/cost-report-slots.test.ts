import { describe, expect, test } from 'bun:test';
import { DEFAULT_DB_POOL_MAX } from '@kortix/db/connection-defaults';
import { HTTPException } from 'hono/http-exception';
import { MAX_COST_REPORTS_PER_REPLICA, MAX_SLOT_WAIT_MS, withCostReportSlot } from './cost-report-slots';

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

describe('withCostReportSlot', () => {
  test('reports past the cap wait in FIFO order and all succeed', async () => {
    const g = gate();
    const order: number[] = [];
    const calls = Array.from({ length: 5 }, (_, i) =>
      withCostReportSlot(async () => {
        order.push(i);
        if (i === 0) await g.opened;
        return 200;
      }),
    );
    await Bun.sleep(5);
    expect(order).toEqual([0]);
    g.open();
    expect(await Promise.all(calls)).toEqual([200, 200, 200, 200, 200]);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  test('a wait past the budget is a 429 with Retry-After, and the timed-out waiter is dropped', async () => {
    const g = gate();
    const held = withCostReportSlot(() => g.opened);
    const refused = await withCostReportSlot(async () => 'ran', 10).catch((e) => e);
    expect(refused).toBeInstanceOf(HTTPException);
    expect((refused as HTTPException).status).toBe(429);
    expect((refused as HTTPException).getResponse().headers.get('Retry-After')).toBe('5');
    const after = withCostReportSlot(async () => 'after');
    g.open();
    await held;
    expect(await after).toBe('after');
  });

  test('the wait budget stays below the 25 s request deadline', () => {
    expect(MAX_SLOT_WAIT_MS).toBeLessThan(25_000);
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
