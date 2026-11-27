import { afterEach, describe, expect, mock, test } from 'bun:test';
import { configureKortix } from '../http/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchSessionLogPage, loadSessionLogPage, readSessionLog, SESSION_LOG_FIRST_PAGE_LIMIT, SESSION_LOG_READ_DEADLINE_MS } from './source';
import type { SessionLog } from './types';

const log: SessionLog = JSON.parse(readFileSync(join(import.meta.dir, '../../../../api-contract/src/__tests__/fixtures/session-log/golden21.v2.json'), 'utf8'));
const page = () => {
  const { threads, ...session } = structuredClone(log);
  return { session, generation: 1, threads: threads.map(({ messages: _m, ...head }) => head), thread_id: threads[0]!.thread_id, messages: threads[0]!.messages, has_more: true };
};

describe('loadSessionLogPage: GET /v1/workspaces/:p/sessions/:s/log', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  function serve(status: number, body: unknown) {
    const urls: string[] = [];
    globalThis.fetch = mock(async (url: unknown) => {
      urls.push(String(url instanceof Request ? url.url : url));
      return Response.json(body, { status });
    }) as unknown as typeof fetch;
    configureKortix({ backendUrl: 'http://test.local/v1', getToken: async () => 'tok' });
    return urls;
  }

  test('asks the route with thread, before_seq and limit, and returns the body', async () => {
    const urls = serve(200, page());
    expect(await loadSessionLogPage!('proj 1', 'kses_1', { thread: 'ses_a', before_seq: 12, limit: 40 })).toEqual(page());
    expect(urls).toEqual(['http://test.local/v1/workspaces/proj%201/sessions/kses_1/log?thread=ses_a&before_seq=12&limit=40']);
  });

  test('a 404 (no stored log, or an unknown thread) reads as no page: the session stays on v1', async () => {
    serve(404, { error: 'No session log for this session' });
    expect(await fetchSessionLogPage(loadSessionLogPage, 'p', 's', { limit: SESSION_LOG_FIRST_PAGE_LIMIT })).toBeNull();
  });

  test('a response whose body stalls after the headers is a failed read at the deadline, and the request is aborted', async () => {
    let request: AbortSignal | undefined;
    globalThis.fetch = mock(async (input: unknown, init?: RequestInit) => {
      request = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      // The headers arrive; the body never finishes.
      return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    configureKortix({ backendUrl: 'http://test.local/v1', getToken: async () => 'tok' });
    const deadlines: Array<{ ms: number; run: () => void }> = [];
    let settled = false;
    const read = readSessionLog(loadSessionLogPage, 'p', 's', { limit: SESSION_LOG_FIRST_PAGE_LIMIT, live: true }, undefined, (run, ms) => {
      deadlines.push({ ms, run });
      return () => {};
    }).finally(() => { settled = true; });
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    expect(deadlines.map((d) => d.ms)).toEqual([SESSION_LOG_READ_DEADLINE_MS]);
    deadlines[0]!.run();
    expect(await read).toEqual({ answer: null, retryAfterMs: null });
    expect(request?.aborted).toBe(true);
  });
});

describe('fetchSessionLogPage', () => {
  test('passes the query (thread, before_seq, limit) and returns a valid page; null on failure', async () => {
    const calls: unknown[] = [];
    const query = { thread: 'ses_child', before_seq: 7, limit: 40 };
    const result = await fetchSessionLogPage(async (...args) => {
      calls.push(args.slice(0, 3));
      return page();
    }, 'proj_1', 'kses_1', query);
    expect(calls).toEqual([['proj_1', 'kses_1', query]]);
    expect(result).toEqual(page());
    expect(await fetchSessionLogPage(async () => { throw new Error('404'); }, 'p', 's', query)).toBeNull();
  });
});
