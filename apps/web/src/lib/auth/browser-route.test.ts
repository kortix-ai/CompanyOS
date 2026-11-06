import { expect, test } from 'bun:test';
import { parseBrowserRoute, browserIdentityPath, stripBrowserSelector, stripBrowserIdentityHeaders } from './browser-route';
import { resolveBrowserRequest } from './browser-request';

test('locale and slot survive navigation; public and foreign origins do not acquire selectors', () => {
  expect(parseBrowserRoute('/de/u/slot_A/projects/p')).toEqual({ locale: 'de', slot: 'slot_A', pathname: '/projects/p' });
  expect(parseBrowserRoute('/u/slot_A/projects')).toEqual({ locale: null, slot: 'slot_A', pathname: '/projects' });
  expect(browserIdentityPath('/projects/p?tab=files#x', '/de/u/slot_A/projects')).toBe('/de/u/slot_A/projects/p?tab=files#x');
  expect(browserIdentityPath('https://example.invalid/projects', '/u/slot_A/projects')).toBe('https://example.invalid/projects');
  expect(browserIdentityPath('/share/p', '/u/slot_A/projects')).toBe('/share/p');
  expect(stripBrowserSelector('/de/u/slot_A/projects/p?q=1')).toBe('/de/projects/p?q=1');
});

test('malformed selectors never become a legacy route', () => {
  for (const path of ['/u/', '/u/%2f/projects', '/u/../projects', '/de/u//projects']) {
    expect(() => parseBrowserRoute(path)).toThrow();
  }
});

test('strips every forged internal identity header', () => {
  const headers = new Headers({ 'x-kortix-browser-slot': 'forged', 'x-kortix-browser-token': 'secret', 'x-kortix-browser-user': 'foreign', accept: 'text/html' });
  stripBrowserIdentityHeaders(headers);
  expect([...headers]).toEqual([['accept', 'text/html']]);
});

test('request adapter uses SDK broker, configured authority, only vault cookie and no-store', async () => {
  let seen: Request | undefined;
  const result = await resolveBrowserRequest(new Request('http://localhost:17700/u/slot_A/projects', { headers: { cookie: 'legacy=private; kortix-vault-local-17700=handle', origin: 'https://forged.invalid' } }), 'slot_A', {
    frontendOrigin: 'http://localhost:17700', backendOrigin: 'http://localhost:17708',
    fetch: async (input, init) => {
      seen = new Request(input, init);
      return Response.json({ access_token: 'synthetic-token', expires_at: 9999999999, user_id: 'synthetic-user-a' });
    },
  });
  expect(result.user_id).toBe('synthetic-user-a');
  expect(seen?.url).toBe('http://localhost:17708/v1/auth/browser-logins/slots/slot_A/token');
  expect(seen?.headers.get('cookie')).toBe('kortix-vault-local-17700=handle');
  expect(seen?.headers.get('origin')).toBe('http://localhost:17700');
  expect(seen?.headers.get('x-kortix-browser-login')).toBe('1');
  expect(seen?.cache).toBe('no-store');
});

test('foreign slot and unavailable broker fail closed without legacy auth', async () => {
  for (const status of [401, 404, 503]) {
    await expect(resolveBrowserRequest(new Request('http://localhost:17700/u/foreign/projects', { headers: { cookie: 'legacy=private; kortix-vault-local-17700=handle' } }), 'foreign', {
      frontendOrigin: 'http://localhost:17700', backendOrigin: 'http://localhost:17708',
      fetch: async () => Response.json({ error: 'browser_login_slot_unavailable' }, { status }),
    })).rejects.toThrow();
  }
});

test('missing and duplicate handles fail before dispatch', async () => {
  let calls = 0;
  for (const cookie of ['', 'legacy=private', 'kortix-vault-local-17700=a; kortix-vault-local-17700=b']) {
    await expect(resolveBrowserRequest(new Request('http://localhost:17700/', { headers: { cookie } }), 'slot_A', {
      frontendOrigin: 'http://localhost:17700', backendOrigin: 'http://localhost:17708',
      fetch: async () => { calls++; return Response.json({}); },
    })).rejects.toThrow('Browser handle required');
  }
  expect(calls).toBe(0);
});


test('explicit private selectors survive and public selectors are removed', () => {
  expect(browserIdentityPath('/u/slot_B/projects?q=1', '/u/slot_A/projects')).toBe('/u/slot_B/projects?q=1');
  expect(browserIdentityPath('/de/u/slot_B/share/p', '/u/slot_A/projects')).toBe('/de/share/p');
});
