/**
 * The runner's failure evidence, proven on a real in-process run.
 *
 * Three synthetic flows fail on purpose against a loopback API: an assertion
 * failure, a thrown error, and a "pass" that ran zero steps. For each one the
 * result and the report must carry the reason, the failing step, the request
 * and its x-request-id, and a link to the case log the API wrote for that
 * case. The loopback API stands in for apps/api on the local test profile: it
 * writes one JSONL line per request to the path `@kortix/api-contract/test-case`
 * names, exactly where the real writer does.
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CASE_HEADER, testCaseLogPath } from '@kortix/api-contract/test-case';
import type { Env } from '../src/core/env';
import { runOneFlow, type FlowWorld } from '../src/core/flow-exec';
import type { RegisteredFlow } from '../src/core/flow';
import { renderFailureLines, writeResults } from '../src/core/report';
import { reconcileExecuted, summarize, type RunResult } from '../src/core/result';

const RUN_ID = 'evidence-run';
let root: string;
let server: Server;
let apiUrl: string;
const seenCases: string[] = [];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'ke2e-evidence-'));
  let seq = 0;
  server = createServer((req, res) => {
    const caseId = String(req.headers[TEST_CASE_HEADER] ?? '');
    seenCases.push(caseId);
    const requestId = `req-${++seq}`;
    const status = req.url === '/v1/boom' ? 500 : 200;
    const file = testCaseLogPath(root, caseId);
    if (file) {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${JSON.stringify({ kind: 'request', path: req.url, status, request_id: requestId })}\n`);
    }
    res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': requestId });
    res.end(JSON.stringify(status === 200 ? { ok: true } : { error: 'upstream exploded' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  apiUrl = `http://127.0.0.1:${address.port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});

const world: FlowWorld = {
  principals: {} as FlowWorld['principals'],
  newStack: (() => ({ push: () => {}, teardown: async () => {} })) as unknown as FlowWorld['newStack'],
  makeFixtures: (() => ({})) as unknown as FlowWorld['makeFixtures'],
};

const flows: RegisteredFlow[] = [
  {
    id: 'EVID-ASSERT',
    meta: { domain: 'evidence' },
    fn: async (ctx) => {
      await ctx.step('anonymous GET /ok is refused -> 401', async () => {
        (await ctx.client.get('/v1/ok')).status(401);
      });
    },
  },
  {
    id: 'EVID-THROW',
    meta: { domain: 'evidence' },
    fn: async (ctx) => {
      await ctx.step('GET /ok answers 200', async () => {
        (await ctx.client.get('/v1/ok')).status(200);
      });
      await ctx.step('GET /boom is survivable', async () => {
        const r = await ctx.client.get('/v1/boom');
        throw new Error(`boom route answered ${r.statusCode}`);
      });
    },
  },
  {
    id: 'EVID-ZERO',
    meta: { domain: 'evidence' },
    fn: async (ctx) => {
      // A request outside any step, then a bare return: KRTX-2852's shape.
      await ctx.client.get('/v1/ok');
    },
  },
];

async function run(): Promise<{ result: RunResult; dir: string }> {
  const env = { apiUrl, capabilities: {}, target: 'local' } as unknown as Env;
  const executed = [];
  for (const f of flows) executed.push(await runOneFlow(f, env, world, RUN_ID));
  const out = reconcileExecuted(flows.map((f) => ({ id: f.id, domain: f.meta.domain })), executed);
  const result: RunResult = {
    runId: RUN_ID,
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(0).toISOString(),
    apiUrl,
    target: 'local',
    gitSha: null,
    capabilities: {},
    profile: 'local',
    targetKind: 'local',
    scheduled: flows.map((f) => f.id),
    fixtureStats: { databaseProjectCount: 0, managedProjectCount: 0 },
    flows: out,
    summary: summarize(out, 1),
  };
  const dir = join(root, RUN_ID);
  return { result: writeResults(result, join(dir, 'results.json'), join(dir, 'report.html')), dir };
}

describe('failure evidence', () => {
  let result: RunResult;
  let dir: string;
  let html: string;
  let lines: string;
  beforeAll(async () => {
    ({ result, dir } = await run());
    html = readFileSync(join(dir, 'report.html'), 'utf8');
    lines = renderFailureLines(result, dir).join('\n');
  });

  it('sends the case id on every request, step 0 outside a step', () => {
    expect(seenCases).toEqual([
      `${RUN_ID}/EVID-ASSERT/1/1`,
      `${RUN_ID}/EVID-THROW/1/1`,
      `${RUN_ID}/EVID-THROW/1/2`,
      `${RUN_ID}/EVID-ZERO/1/0`,
    ]);
  });

  it('fails all three and counts them', () => {
    expect(result.flows.map((f) => [f.id, f.status])).toEqual([
      ['EVID-ASSERT', 'fail'],
      ['EVID-THROW', 'fail'],
      ['EVID-ZERO', 'fail'],
    ]);
    expect(result.summary.failed).toBe(3);
    expect(result.scheduled).toEqual(['EVID-ASSERT', 'EVID-THROW', 'EVID-ZERO']);
  });

  it('assertion failure: reason, step, request, x-request-id and case log', () => {
    const f = result.flows.find((x) => x.id === 'EVID-ASSERT')!;
    expect(f.reason).toMatch(/expected 401, got 200|expected.*401.*200/);
    const step = f.steps[0]!;
    expect(step).toMatchObject({ name: 'anonymous GET /ok is refused -> 401', status: 'fail', caseLog: 'case-logs/EVID-ASSERT.1.1.jsonl' });
    expect(step.requests[0]!.req.url).toBe(`${apiUrl}/ok`);
    expect(step.requests[0]!.res.headers['x-request-id']).toBe('req-1');
    expect(readFileSync(join(dir, step.caseLog!), 'utf8')).toContain('"request_id":"req-1"');
    expect(lines).toContain('FAIL EVID-ASSERT');
    expect(lines).toContain('step: anonymous GET /ok is refused -> 401');
    expect(lines).toContain(`request: GET ${apiUrl}/ok -> 200`);
    expect(lines).toContain('x-request-id: req-1');
    expect(lines).toContain(join(dir, 'case-logs/EVID-ASSERT.1.1.jsonl'));
  });

  it('thrown error: the second step names the error and its own case log', () => {
    const f = result.flows.find((x) => x.id === 'EVID-THROW')!;
    expect(f.reason).toBe('boom route answered 500');
    expect(f.steps.map((s) => s.status)).toEqual(['pass', 'fail']);
    expect(f.steps[1]).toMatchObject({ name: 'GET /boom is survivable', caseLog: 'case-logs/EVID-THROW.1.2.jsonl' });
    expect(f.steps[1]!.error?.message).toBe('boom route answered 500');
    expect(lines).toContain(`request: GET ${apiUrl}/boom -> 500`);
    expect(lines).toContain('x-request-id: req-3');
  });

  it('zero-step pass: fails with the proof reason and links the flow-body case log', () => {
    const f = result.flows.find((x) => x.id === 'EVID-ZERO')!;
    expect(f.reason).toMatch(/passed with zero steps/);
    expect(f.caseLog).toBe('case-logs/EVID-ZERO.1.0.jsonl');
    expect(lines).toContain(join(dir, 'case-logs/EVID-ZERO.1.0.jsonl'));
  });

  it('report.html carries every reason, failing step and case-log link', () => {
    for (const text of [
      'boom route answered 500',
      'passed with zero steps',
      'anonymous GET /ok is refused -> 401',
      'GET /boom is survivable',
      'case-logs/EVID-ASSERT.1.1.jsonl',
      'case-logs/EVID-THROW.1.2.jsonl',
      'case-logs/EVID-ZERO.1.0.jsonl',
      'req-3',
    ]) {
      expect(html).toContain(text);
    }
    // The renderer links failed steps from the data block it embeds.
    expect(html).toContain('class="caselog"');
  });
});
