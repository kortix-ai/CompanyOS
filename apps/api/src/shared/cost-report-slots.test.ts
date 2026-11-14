import { describe, expect, test } from 'bun:test';
import { HTTPException } from 'hono/http-exception';
import { MAX_COST_REPORTS_PER_ACCOUNT, withCostReportSlot } from './cost-report-slots';

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

describe('withCostReportSlot', () => {
  test('refuses an account past its in-flight cap with a 429 and Retry-After', async () => {
    const g = gate();
    const held = Array.from({ length: MAX_COST_REPORTS_PER_ACCOUNT }, () =>
      withCostReportSlot('acct-a', () => g.opened),
    );
    const refused = await withCostReportSlot('acct-a', async () => 'ran').catch((e) => e);
    expect(refused).toBeInstanceOf(HTTPException);
    expect((refused as HTTPException).status).toBe(429);
    expect((refused as HTTPException).getResponse().headers.get('Retry-After')).toBe('5');
    g.open();
    await Promise.all(held);
  });

  test('another account is unaffected while one is at its cap', async () => {
    const g = gate();
    const held = Array.from({ length: MAX_COST_REPORTS_PER_ACCOUNT }, () =>
      withCostReportSlot('acct-b', () => g.opened),
    );
    expect(await withCostReportSlot('acct-c', async () => 'ran')).toBe('ran');
    g.open();
    await Promise.all(held);
  });

  test('a slot frees when the work settles, success or failure', async () => {
    for (let i = 0; i < MAX_COST_REPORTS_PER_ACCOUNT * 3; i++) {
      await withCostReportSlot('acct-d', async () => {
        if (i % 2) throw new Error('boom');
      }).catch(() => undefined);
    }
    expect(await withCostReportSlot('acct-d', async () => 'ran')).toBe('ran');
  });
});
