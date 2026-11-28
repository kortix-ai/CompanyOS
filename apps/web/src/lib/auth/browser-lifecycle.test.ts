import { expect, test } from 'bun:test';
import { createBrowserLifecycle } from './browser-lifecycle';

test('revocation fences a late bootstrap publish and is terminal', async () => {
  const pending: Array<(value: string) => void> = [];
  const published: string[] = [];
  const lifecycle = createBrowserLifecycle({
    validate: () => new Promise<string>((r) => pending.push(r)),
    clear() {},
    publish: (v) => published.push(v),
    error() {},
  });
  lifecycle.revalidate();
  lifecycle.revoke();
  pending[0]('private');
  await Promise.resolve();
  expect(published).toEqual([]);
  lifecycle.revalidate();
  expect(pending).toHaveLength(1);
});

test('transient errors retry, authoritative rejection clears permanently', async () => {
  let status = 503;
  let calls = 0;
  const published: string[] = [];
  const lifecycle = createBrowserLifecycle({
    validate: async () => {
      calls++;
      if (status) throw { status };
      return 'verified';
    },
    clear() {},
    publish: (v) => published.push(v),
    error() {},
  });
  lifecycle.revalidate();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  status = 0;
  lifecycle.revalidate();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(published).toEqual(['verified']);
  status = 404;
  lifecycle.revalidate();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  lifecycle.revalidate();
  expect(calls).toBe(3);
});

test('invalidation during validation coalesces and never publishes the stale result', async () => {
  const pending: Array<(value: string) => void> = [];
  const published: string[] = [];
  const lifecycle = createBrowserLifecycle({
    validate: () => new Promise<string>((r) => pending.push(r)),
    clear() {},
    publish: (v) => published.push(v),
    error() {},
  });
  lifecycle.revalidate();
  lifecycle.revalidate();
  lifecycle.revalidate();
  pending[0]('stale');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(published).toEqual([]);
  expect(pending).toHaveLength(2);
  pending[1]('current');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(published).toEqual(['current']);
});

test('coalesced background validation does not clear the mounted document', async () => {
  const pending: Array<(value: string) => void> = [];
  let cleared = 0;
  const lifecycle = createBrowserLifecycle({
    validate: () => new Promise<string>((r) => pending.push(r)),
    clear: () => {
      cleared++;
    },
    publish() {},
    error() {},
  });
  lifecycle.revalidate(false);
  lifecycle.revalidate(false);
  pending[0]('stale');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(cleared).toBe(0);
  pending[1]('current');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(cleared).toBe(0);
});

test('background transient failures keep a working document; authoritative rejection revokes it', async () => {
  let status = 0,
    clears = 0,
    errors = 0;
  const lifecycle = createBrowserLifecycle({
    validate: async () => {
      if (status) throw { status };
      return 'verified';
    },
    clear() {
      clears++;
    },
    publish() {},
    error() {
      errors++;
    },
  });
  lifecycle.revalidate();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  clears = 0;
  for (const code of [503, 429, 0]) {
    status = code;
    lifecycle.revalidate(false);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(clears).toBe(0);
    expect(errors).toBe(0);
  }
  status = 403;
  lifecycle.revalidate(false);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(clears).toBeGreaterThan(0);
  expect(errors).toBe(1);
});

test('a hidden validation queued after background failure still settles the gate', async () => {
  const pending: Array<(error: unknown) => void> = [];
  let errors = 0;
  const lifecycle = createBrowserLifecycle({
    validate: () => new Promise<string>((_resolve, reject) => pending.push(reject)),
    clear() {},
    publish() {},
    error() {
      errors++;
    },
  });
  lifecycle.revalidate(false);
  lifecycle.revalidate(true);
  pending[0]({ status: 503 });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(pending.length).toBe(2);
  pending[1]({ status: 503 });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(errors).toBe(1);
});

test('background work queued during initial validation still reports a cold failure', async () => {
  const pending: Array<(error: unknown) => void> = [];
  let errors = 0;
  const lifecycle = createBrowserLifecycle({
    validate: () => new Promise<string>((_r, reject) => pending.push(reject)),
    clear() {},
    publish() {},
    error() {
      errors++;
    },
  });
  lifecycle.revalidate();
  lifecycle.revalidate(false);
  pending[0]({ status: 503 });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  pending[1]({ status: 503 });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(errors).toBe(1);
});

test('a disposed request cannot clear its replacement after a late rejection', async () => {
  let reject!: (error: unknown) => void;
  let errors = 0,
    clears = 0;
  const lifecycle = createBrowserLifecycle({
    validate: () =>
      new Promise<string>((_r, r) => {
        reject = r;
      }),
    clear() {
      clears++;
    },
    publish() {},
    error() {
      errors++;
    },
  });
  lifecycle.revalidate();
  lifecycle.dispose();
  const initial = clears;
  reject({ status: 401 });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(clears).toBe(initial);
  expect(errors).toBe(0);
});
