/**
 * A connector call emits one `connector.call` span with child spans for the
 * credential, policy and upstream steps. The attributes name the call, never
 * its arguments, its result or the upstream body.
 *
 * Pure unit test: the OTLP exporter and the logger are mocked, every gateway
 * dep is faked. No PostgreSQL, no network.
 */
import { afterEach, expect, mock, test } from 'bun:test';

interface Span {
  name: string;
  kind?: string;
  spanId?: string;
  parentSpanId?: string;
  startTimeMs: number;
  endTimeMs?: number;
  attributes?: Record<string, unknown>;
  error?: boolean;
}
const spans: Span[] = [];
let nextId = 0;
mock.module('../lib/otel', () => ({
  emitOtelSpan: async (span: Span) => {
    spans.push(span);
    return true;
  },
  isOtelTraceExporterConfigured: () => true,
  newOtelSpanId: () => `span-${++nextId}`,
}));
mock.module('../lib/logger', () => ({
  logger: { debug() {}, info() {}, error() {}, warn() {} },
}));

import { connectorCallSpanAttributes } from './call-spans';
import { type GatewayDeps, handleCall } from './gateway';

const SECRET_ARG = 'synthetic-argument-value-5521';
const UPSTREAM_SECRET = 'synthetic-upstream-record-9034';

function deps(upstream: { status: number; body: string }): GatewayDeps {
  return {
    loadConnectorBySlug: async () => ({
      connectorId: 'conn-echo',
      slug: 'echo',
      provider: 'http',
      baseUrl: 'https://echo.example',
      auth: { type: 'bearer', in: 'header', name: null, prefix: null },
      hasAuth: true,
      credentialMode: 'shared',
      enabled: true,
    }),
    loadAction: async () => ({
      path: 'echo.send',
      relPath: 'send',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
      risk: 'write',
      binding: { kind: 'http', method: 'POST', path: '/send' },
    }),
    resolveCredential: async () => 'synthetic-credential',
    loadPolicies: async () => [],
    recordExecution: async () => 'exec-1',
    fetchImpl: async () => ({ status: upstream.status, ok: upstream.status < 400, text: async () => upstream.body }),
  };
}

const call = (upstream: { status: number; body: string }) =>
  handleCall(deps(upstream), {
    projectId: 'project-fake',
    accountId: 'account-fake',
    subject: { userId: 'user-fake', groupIds: [] },
    connectorSlug: 'echo',
    actionPath: 'send',
    args: { text: SECRET_ARG },
    caller: { credentialId: 'tok-1', principalKind: 'agent', agentSlug: 'helper', surface: 'mcp', approvalDelivery: null },
  });

afterEach(() => {
  spans.length = 0;
});

test('the attribute set is exactly the call facts', () => {
  expect(
    connectorCallSpanAttributes({
      connectorSlug: 'echo',
      actionPath: 'echo.send',
      risk: 'write',
      status: 'denied',
      refusalReason: 'policy_denied',
      surface: 'session',
      agentSlug: 'helper',
      phase: 'policy',
      kortixMs: 4,
      upstreamMs: null,
    }),
  ).toEqual({
    'kortix.connector.slug': 'echo',
    'kortix.connector.action_path': 'echo.send',
    'kortix.connector.risk': 'write',
    'kortix.connector.status': 'denied',
    'kortix.connector.refusal_reason': 'policy_denied',
    'kortix.connector.surface': 'session',
    'kortix.connector.agent': 'helper',
    'kortix.connector.phase': 'policy',
    'kortix.connector.kortix_ms': 4,
    'kortix.connector.upstream_ms': null,
  });
});

test('a call that reached the upstream emits connector.call with credential, policy and upstream children', async () => {
  expect(await call({ status: 200, body: `{"ok":true,"echo":"${UPSTREAM_SECRET}"}` })).toMatchObject({ status: 'ok' });

  const root = spans.find((s) => s.name === 'connector.call');
  expect(root).toBeDefined();
  expect(root!.attributes).toMatchObject({
    'kortix.connector.slug': 'echo',
    'kortix.connector.action_path': 'echo.send',
    'kortix.connector.risk': 'write',
    'kortix.connector.status': 'ok',
    'kortix.connector.surface': 'mcp',
    'kortix.connector.agent': 'helper',
    'kortix.connector.phase': 'done',
  });
  expect(root!.error).toBe(false);

  const children = spans.filter((s) => s !== root);
  expect(children.map((s) => s.name).sort()).toEqual(['connector.credential', 'connector.policy', 'connector.upstream']);
  for (const child of children) {
    expect(child.parentSpanId).toBe(root!.spanId);
    expect(child.startTimeMs).toBeGreaterThanOrEqual(root!.startTimeMs);
    expect(child.endTimeMs!).toBeLessThanOrEqual(root!.endTimeMs!);
  }
  expect(children.find((s) => s.name === 'connector.upstream')!.kind).toBe('CLIENT');

  // No argument, no result body anywhere in the exported spans.
  const exported = JSON.stringify(spans);
  expect(exported).not.toContain(SECRET_ARG);
  expect(exported).not.toContain(UPSTREAM_SECRET);
});

test('an upstream failure marks the call and the upstream span failed, with the reason code only', async () => {
  expect(await call({ status: 404, body: `{"error":"${UPSTREAM_SECRET}"}` })).toMatchObject({ status: 'error' });

  const root = spans.find((s) => s.name === 'connector.call')!;
  expect(root.error).toBe(true);
  expect(root.attributes).toMatchObject({
    'kortix.connector.status': 'error',
    'kortix.connector.refusal_reason': 'upstream_404',
    'kortix.connector.phase': 'upstream',
  });
  expect(spans.find((s) => s.name === 'connector.upstream')!.error).toBe(true);
  expect(JSON.stringify(spans)).not.toContain(UPSTREAM_SECRET);
  expect(JSON.stringify(spans)).not.toContain(SECRET_ARG);
});

test('a call refused before any step emits only the call span, once', async () => {
  const refused = await handleCall(
    { ...deps({ status: 200, body: '{}' }), loadAction: async () => null },
    {
      projectId: 'project-fake',
      accountId: 'account-fake',
      subject: { userId: 'user-fake', groupIds: [] },
      connectorSlug: 'echo',
      actionPath: 'missing',
      args: {},
    },
  );
  expect(refused).toMatchObject({ status: 'denied', reason: 'action_not_found' });
  expect(spans.map((s) => s.name)).toEqual(['connector.call']);
  expect(spans[0]!.attributes).toMatchObject({
    'kortix.connector.refusal_reason': 'action_not_found',
    'kortix.connector.phase': 'grant',
  });
});
