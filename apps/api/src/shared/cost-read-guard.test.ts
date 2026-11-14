import { describe, expect, test } from 'bun:test';
import { HTTPException } from 'hono/http-exception';
import { COST_READ_CODE, COST_READ_MAX_IN_FLIGHT, withCostReadGuard } from './cost-read-guard';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Start `COST_READ_MAX_IN_FLIGHT` reads for the account that stay open until `gate` resolves. */
function saturate(accountId: string, gate: Promise<void>) {
  return Array.from({ length: COST_READ_MAX_IN_FLIGHT }, () => withCostReadGuard(accountId, () => gate));
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HTTPException);
  return (error as HTTPException).getResponse();
}

describe('withCostReadGuard', () => {
  test('refuses the read past the cap with 429, a Retry-After and a stable code', async () => {
    const gate = deferred();
    const held = saturate('acct-a', gate.promise);
    const res = await refusal(withCostReadGuard('acct-a', async () => 'never'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('5');
    expect((await res.json()).code).toBe(COST_READ_CODE);
    gate.resolve();
    await Promise.all(held);
  });

  test('does not run the refused read', async () => {
    const gate = deferred();
    const held = saturate('acct-b', gate.promise);
    let ran = false;
    await refusal(withCostReadGuard('acct-b', async () => { ran = true; }));
    expect(ran).toBe(false);
    gate.resolve();
    await Promise.all(held);
  });

  test('another account is not affected by a saturated one', async () => {
    const gate = deferred();
    const held = saturate('acct-c', gate.promise);
    expect(await withCostReadGuard('acct-d', async () => 'ok')).toBe('ok');
    gate.resolve();
    await Promise.all(held);
  });

  test('frees the slot when a read fails', async () => {
    for (let i = 0; i <= COST_READ_MAX_IN_FLIGHT; i++) {
      await expect(withCostReadGuard('acct-e', async () => { throw new Error('db down'); })).rejects.toThrow('db down');
    }
  });

  test('keeps the slots until the reads settle, then frees them', async () => {
    const gate = deferred();
    const held = saturate('acct-f', gate.promise);
    expect((await refusal(withCostReadGuard('acct-f', async () => 'x'))).status).toBe(429);
    gate.resolve();
    await Promise.all(held);
    expect(await withCostReadGuard('acct-f', async () => 'x')).toBe('x');
  });
});
