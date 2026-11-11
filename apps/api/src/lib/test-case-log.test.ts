import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { installHttpMiddleware } from '../http-middleware';
import { logger } from './logger';
import { getRequestContext, runWithContext, setContextField } from './request-context';
import {
  TEST_CASE_CONTEXT_FIELD,
  TEST_CASE_HEADER,
  appendTestCaseLog,
  disableTestCaseLog,
  enableTestCaseLog,
  testCaseFromHeader,
} from './test-case-log';

const CASE = 'run-1/CONN-5/1/2';
const dirs: string[] = [];
const freshDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'case-log-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  disableTestCaseLog();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function probeApp() {
  const app = new OpenAPIHono();
  installHttpMiddleware(app);
  app.get('/v1/case-probe', (c) => {
    logger.info('case probe handled', { probe: true });
    return c.json({ test_case: getRequestContext()?.[TEST_CASE_CONTEXT_FIELD] ?? null });
  });
  return app;
}

describe('test case log', () => {
  test('off by default: the header is ignored, no field is set, and nothing is written', async () => {
    const dir = freshDir();
    expect(testCaseFromHeader(CASE)).toBeUndefined();
    appendTestCaseLog(CASE, { kind: 'log' });
    runWithContext('GET', '/x', () => {
      setContextField(TEST_CASE_CONTEXT_FIELD, CASE);
      logger.info('not written anywhere');
    });
    const res = await probeApp().request('/v1/case-probe', { headers: { [TEST_CASE_HEADER]: CASE } });
    expect(await res.json()).toEqual({ test_case: null });
    expect(readdirSync(dir)).toEqual([]);
  });

  test('on: the request line and the log line land in the case file, with the request id', async () => {
    const dir = freshDir();
    enableTestCaseLog(dir);
    const res = await probeApp().request('/v1/case-probe', { headers: { [TEST_CASE_HEADER]: CASE } });
    expect(await res.json()).toEqual({ test_case: CASE });
    const file = join(dir, 'run-1/case-logs/CONN-5.1.2.jsonl');
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.find((l) => l.kind === 'log')).toMatchObject({ level: 'info', message: 'case probe handled', context: { probe: true } });
    expect(lines.find((l) => l.kind === 'request')).toMatchObject({
      method: 'GET',
      path: '/v1/case-probe',
      status: 200,
      request_id: res.headers.get('x-request-id'),
    });
  });

  test('on: a malformed or traversing header writes nothing', async () => {
    const dir = freshDir();
    enableTestCaseLog(dir);
    for (const bad of ['../../etc/1/1', 'run/F/1', 'run/F/one/1']) {
      expect(testCaseFromHeader(bad)).toBeUndefined();
      appendTestCaseLog(bad, { kind: 'log' });
      const res = await probeApp().request('/v1/case-probe', { headers: { [TEST_CASE_HEADER]: bad } });
      expect(await res.json()).toEqual({ test_case: null });
    }
    expect(readdirSync(dir)).toEqual([]);
    expect(existsSync(join(dir, '..', 'etc'))).toBe(false);
  });
});
