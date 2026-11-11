/**
 * An App tool call reaches the App through `callAppTarget` with who calls it:
 * the agent-session assertion, the signed viewer the App verifies with its own
 * secret, and the tool name. It never forwards a caller's Authorization,
 * cookie or x-kortix-* header, and it returns the App's answer with its body.
 */
import { describe, expect, test } from 'bun:test';

process.env.INTERNAL_KORTIX_ENV = 'dev';

const { callAppTool } = await import('./app-tool-call');
const { verifyAppAgentAssertion } = await import('./access');
const { appViewerSecret, verifyAppViewerContext } = await import('./viewer');

const PROJECT = '22222222-2222-4222-8222-222222222222';
const APP_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '33333333-3333-4333-8333-333333333333';
const USER = '55555555-5555-4555-8555-555555555555';
const TOKEN = 'a0000000-0000-4000-8000-000000000001';

type TargetInput = Parameters<typeof import('./app-call').callAppTarget>[0];

function fakeDeps(answer: Awaited<ReturnType<typeof import('./app-call').callAppTarget>>, viewerTokenScope: string | null = 'identity') {
  const calls: TargetInput[] = [];
  return {
    calls,
    deps: {
      loadApp: async (projectId: string, slug: string) =>
        projectId === PROJECT && slug === 'orders' ? { appId: APP_ID, accountId: ACCOUNT, accessMode: 'private', viewerTokenScope } : null,
      viewerIdentity: async () => ({ email: 'member@example.com', groupIds: ['g1'], groups: ['ops'], role: 'member' }),
      callAppTarget: async (input: TargetInput) => {
        calls.push(input);
        return answer;
      },
    },
  };
}

const base = {
  projectId: PROJECT,
  app: 'orders',
  method: 'POST',
  path: '/orders?dry=1',
  body: '{"customer":"c-9"}',
  maxResponseBytes: 1024,
};

describe('callAppTool', () => {
  test('an agent session call carries the assertion, the signed viewer and the tool; the App answer comes back', async () => {
    const { calls, deps } = fakeDeps({ ok: true, status: 201, error: null, retryable: false, body: { text: '{"id":"o-1"}', contentType: 'application/json' } });
    const answer = await callAppTool(
      {
        ...base,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer stolen', Cookie: 'sid=1', 'x-kortix-app-viewer': 'forged' },
        caller: { userId: USER, sessionId: 'sess-1', actingTokenId: TOKEN, agentSlug: 'support', tool: 'connectors.app-orders.create_order' },
      },
      deps,
    );
    expect(answer).toEqual({ status: 201, ok: true, text: '{"id":"o-1"}' });
    expect(calls).toHaveLength(1);
    const sent = calls[0]!;
    expect(sent.method).toBe('POST');
    expect(sent.path).toBe('/orders?dry=1');
    expect(sent.body).toBe('{"customer":"c-9"}');
    expect(sent.readBody).toEqual({ maxBytes: 1024 });
    expect(sent.headers['Content-Type']).toBe('application/json');
    expect(sent.headers.Authorization).toBeUndefined();
    expect(sent.headers.Cookie).toBeUndefined();
    expect(sent.headers['x-kortix-tool']).toBe('connectors.app-orders.create_order');
    expect(sent.headers['x-kortix-agent']).toBe('support');
    expect(sent.headers['x-kortix-session-id']).toBe('sess-1');
    const assertion = sent.headers['X-Kortix-App-Authorization']!.replace(/^Bearer /, '');
    expect(verifyAppAgentAssertion(assertion, { appId: APP_ID, projectId: PROJECT })).toEqual({ tokenId: TOKEN });
    const viewer = verifyAppViewerContext(sent.headers['x-kortix-app-viewer'], appViewerSecret(APP_ID));
    expect(viewer.ok && viewer.viewer.userId).toBe(USER);
    expect(viewer.ok && viewer.viewer.email).toBe('member@example.com');
    expect(JSON.stringify(sent.headers)).not.toContain('stolen');
  });

  test('a call without a session gets no assertion; an App that shares nothing gets no viewer', async () => {
    const { calls, deps } = fakeDeps({ ok: false, status: 404, error: 'x', retryable: false, body: { text: 'nope', contentType: 'text/plain' } }, 'off');
    const answer = await callAppTool(
      { ...base, headers: {}, caller: { userId: USER, sessionId: null, actingTokenId: TOKEN, agentSlug: null, tool: 'connectors.app-orders.create_order' } },
      deps,
    );
    expect(answer).toEqual({ status: 404, ok: false, text: 'nope' });
    expect(calls[0]!.headers['X-Kortix-App-Authorization']).toBeUndefined();
    expect(calls[0]!.headers['x-kortix-app-viewer']).toBeUndefined();
    expect(calls[0]!.headers['x-kortix-agent']).toBeUndefined();
  });

  test('no App, or an App that does not answer, throws with the reason', async () => {
    const { deps } = fakeDeps({ ok: false, status: null, error: 'App "orders" has no ready release that serves http', retryable: true });
    const caller = { userId: USER, sessionId: null, actingTokenId: null, agentSlug: null, tool: 't' };
    await expect(callAppTool({ ...base, app: 'missing', headers: {}, caller }, deps)).rejects.toThrow('app_not_found: no App "missing"');
    await expect(callAppTool({ ...base, headers: {}, caller }, deps)).rejects.toThrow('app_unavailable: App "orders" has no ready release that serves http');
  });
});
