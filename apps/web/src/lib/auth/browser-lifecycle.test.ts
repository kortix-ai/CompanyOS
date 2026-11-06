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
