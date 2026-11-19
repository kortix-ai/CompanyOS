import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';
import { inFlightLimit } from './in-flight-limit';

function build(max: number) {
  const gates: Array<() => void> = [];
  const app = new Hono();
  app.use('*', inFlightLimit(max, (c) => c.req.header('x-user') ?? null));
  app.get('/slow', async (c) => {
    await new Promise<void>((resolve) => gates.push(resolve));
    return c.json({ ok: true });
  });
  const call = (user?: string) => app.request('/slow', { headers: user ? { 'x-user': user } : {} });
  const release = () => gates.splice(0).forEach((open) => open());
  return { app, call, release };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('inFlightLimit', () => {
  test('rejects the request past the cap with 429 + Retry-After, per key', async () => {
    const { call, release } = build(2);
    const a1 = call('a');
    const a2 = call('a');
    await tick();
    const a3 = await call('a');
    expect(a3.status).toBe(429);
    expect(a3.headers.get('Retry-After')).toBe('5');
    expect(((await a3.json()) as { error: string }).error).toBe('too_many_in_flight');
    // another caller is unaffected
    const b1 = call('b');
    await tick();
    release();
    expect((await a1).status).toBe(200);
    expect((await a2).status).toBe(200);
    expect((await b1).status).toBe(200);
  });

  test('frees the slot when the handler settles, not when the deadline answers', async () => {
    const gates: Array<() => void> = [];
    const app = new Hono();
    app.use('*', timeout(20, () => new HTTPException(503)));
    app.use('*', inFlightLimit(1, () => 'a'));
    app.get('/slow', async (c) => {
      await new Promise<void>((resolve) => gates.push(resolve));
      return c.text('late');
    });
    const first = await app.request('/slow');
    expect(first.status).toBe(503);
    // the orphaned handler is still running: its slot is still taken
    expect((await app.request('/slow')).status).toBe(429);
    gates.splice(0).forEach((open) => open());
    await tick();
    const third = app.request('/slow');
    await tick();
    expect(gates.length).toBe(1);
    gates.splice(0).forEach((open) => open());
    await third;
  });

  test('releases the slot when the handler throws', async () => {
    const app = new Hono();
    app.use('*', inFlightLimit(1, () => 'a'));
    app.get('/boom', () => {
      throw new Error('boom');
    });
    expect((await app.request('/boom')).status).toBe(500);
    expect((await app.request('/boom')).status).toBe(500);
  });

  test('a null key skips the limit', async () => {
    const { call, release } = build(1);
    const r = [call(), call(), call()];
    await tick();
    release();
    expect((await Promise.all(r)).map((x) => x.status)).toEqual([200, 200, 200]);
  });
});
