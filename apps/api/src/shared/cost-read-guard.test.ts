import { describe, expect, test } from 'bun:test';
import { HTTPException } from 'hono/http-exception';
import { COST_READ_CODE, withCostReadGuard } from './cost-read-guard';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
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
  test('refuses a second concurrent read with 429, a Retry-After and a stable code', async () => {
    const gate = deferred();
    const held = withCostReadGuard(() => gate.promise);
    const res = await refusal(withCostReadGuard(async () => 'never'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('5');
    expect((await res.json()).code).toBe(COST_READ_CODE);
    gate.resolve();
    await held;
  });

  test('never runs more than one read at once, whatever the burst', async () => {
    const gate = deferred();
    let started = 0;
    const burst = Array.from({ length: 20 }, () =>
      withCostReadGuard(async () => {
        started += 1;
        await gate.promise;
      }).catch(() => undefined),
    );
    await Promise.resolve();
    expect(started).toBe(1);
    gate.resolve();
    await Promise.all(burst);
  });

  test('frees the permit when a read fails', async () => {
    await expect(withCostReadGuard(async () => { throw new Error('db down'); })).rejects.toThrow('db down');
    expect(await withCostReadGuard(async () => 'ok')).toBe('ok');
  });

  test('keeps the permit until the read settles, then frees it', async () => {
    const gate = deferred();
    const held = withCostReadGuard(() => gate.promise);
    expect((await refusal(withCostReadGuard(async () => 'x'))).status).toBe(429);
    gate.resolve();
    await held;
    expect(await withCostReadGuard(async () => 'x')).toBe('x');
  });
});
