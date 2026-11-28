import { test, expect } from 'bun:test';
import { resolveVerifiedBrowserRequest } from './browser-request';
test('selected request verifies the broker subject through SDK user endpoint', async () => {
  const calls: string[] = [];
  const result = await resolveVerifiedBrowserRequest(new Request('http://localhost:17700/u/A/projects', { headers: { cookie: 'kortix-vault-local-17700=h' } }), 'A', {
    frontendOrigin: 'http://localhost:17700', backendOrigin: 'http://localhost:17708',
    fetch: async (url) => {
      calls.push(String(url));
      return Response.json(String(url).endsWith('/token') ? { access_token: 'token', user_id: 'A', expires_at: 9999999999 } : { user: { id: 'B' } });
    },
  }).catch(() => null);
  expect(result).toBeNull();
  expect(calls).toHaveLength(2);
});

test('selected capability rejects legacy refresh and never subscribes to shared auth events', async () => {
  const { selectedSupabaseCapability } = await import('./browser-document');
  let legacyCalls = 0;
  const legacy = { auth: { refreshSession: () => { legacyCalls++; }, onAuthStateChange: () => { legacyCalls++; } } };
  const selected = selectedSupabaseCapability(legacy as never);
  expect(() => selected.auth.refreshSession()).toThrow('unavailable');
  selected.auth.onAuthStateChange(() => { throw new Error('Legacy event published'); }).data.subscription.unsubscribe();
  expect(legacyCalls).toBe(0);
});
