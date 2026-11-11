import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeMcpServer, startMcpServer } from '../src/fixtures/fakes/mcp-server';
import { type FakeOAuthClient, type FakeOAuthIssuer, startOAuthIssuer } from '../src/fixtures/fakes/oauth-issuer';
import { type FakeOpenApiUpstream, startOpenApiUpstream } from '../src/fixtures/fakes/openapi-upstream';

const REDIRECT = 'http://127.0.0.1:1/v1/connectors/oauth2/callback';
const form = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

async function authorize(issuer: FakeOAuthIssuer, client: FakeOAuthClient, challenge: string, extra: Record<string, string> = {}) {
  const url = new URL(issuer.authorizationEndpoint);
  const params = {
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    state: 'state-1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'read',
    ...extra,
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { redirect: 'manual' });
  return { res, location: res.headers.get('location') ? new URL(res.headers.get('location')!) : null };
}

async function tokenPost(issuer: FakeOAuthIssuer, fields: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await fetch(issuer.tokenEndpoint, { method: 'POST', headers: { ...formHeaders, ...headers }, body: form(fields) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const basic = (c: FakeOAuthClient) => ({
  authorization: `Basic ${Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64')}`,
});

describe('fake OAuth 2.0 issuer', () => {
  let issuer: FakeOAuthIssuer;
  let confidential: FakeOAuthClient;
  let publicClient: FakeOAuthClient;

  beforeAll(async () => {
    issuer = await startOAuthIssuer({ accessTokenTtlSeconds: 120 });
    confidential = issuer.addClient({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' });
    publicClient = issuer.addClient({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' });
  });
  afterAll(() => issuer.close());

  it('serves RFC 8414 metadata on 127.0.0.1', async () => {
    expect(issuer.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const meta = (await (await fetch(issuer.metadataUrl)).json()) as Record<string, unknown>;
    expect(meta).toMatchObject({
      issuer: issuer.issuer,
      authorization_endpoint: issuer.authorizationEndpoint,
      token_endpoint: issuer.tokenEndpoint,
      registration_endpoint: issuer.registrationEndpoint,
      revocation_endpoint: issuer.revocationEndpoint,
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('authorize redirects with code, state and iss; the code exchanges once with the right verifier', async () => {
    const { verifier, challenge } = pkce();
    const { res, location } = await authorize(issuer, publicClient, challenge);
    expect(res.status).toBe(302);
    expect(location!.origin + location!.pathname).toBe(REDIRECT);
    expect(location!.searchParams.get('state')).toBe('state-1');
    expect(location!.searchParams.get('iss')).toBe(issuer.issuer);
    const code = location!.searchParams.get('code')!;
    const ok = await tokenPost(issuer, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier, client_id: publicClient.client_id });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ token_type: 'Bearer', expires_in: 120, scope: 'read' });
    expect(issuer.isActive(ok.body.access_token)).toBe(true);
    expect(issuer.grants.at(-1)).toMatchObject({ grant_type: 'authorization_code', auth_method: 'none', ok: true });
    const replay = await tokenPost(issuer, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier, client_id: publicClient.client_id });
    expect(replay).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
  });

  it('refuses a PKCE mismatch, a missing challenge, an unknown client and an unregistered redirect_uri', async () => {
    const { challenge } = pkce();
    const { location } = await authorize(issuer, confidential, challenge);
    const mismatch = await tokenPost(
      issuer,
      { grant_type: 'authorization_code', code: location!.searchParams.get('code')!, redirect_uri: REDIRECT, code_verifier: pkce().verifier },
      basic(confidential),
    );
    expect(mismatch).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });

    const noPkce = await authorize(issuer, confidential, '', { code_challenge_method: 'plain' });
    expect(noPkce.res.status).toBe(302);
    expect(noPkce.location!.searchParams.get('error')).toBe('invalid_request');

    const unknown = await authorize(issuer, { ...confidential, client_id: 'nobody' }, challenge);
    expect(unknown.res.status).toBe(400);
    const badRedirect = await authorize(issuer, confidential, challenge, { redirect_uri: 'http://127.0.0.1:2/elsewhere' });
    expect(badRedirect.res.status).toBe(400);
    expect(badRedirect.location).toBeNull();
  });

  it('denies consent with access_denied', async () => {
    issuer.setConsent('deny');
    const { location } = await authorize(issuer, confidential, pkce().challenge);
    issuer.setConsent('approve');
    expect(location!.searchParams.get('error')).toBe('access_denied');
    expect(location!.searchParams.get('code')).toBeNull();
  });

  it('rotates refresh tokens: the old one is refused after use (client_secret_basic and _post)', async () => {
    const { verifier, challenge } = pkce();
    const { location } = await authorize(issuer, confidential, challenge);
    const first = await tokenPost(
      issuer,
      { grant_type: 'authorization_code', code: location!.searchParams.get('code')!, redirect_uri: REDIRECT, code_verifier: verifier },
      basic(confidential),
    );
    expect(first.status).toBe(200);
    expect(issuer.grants.at(-1)!.auth_method).toBe('client_secret_basic');
    const refreshed = await tokenPost(issuer, {
      grant_type: 'refresh_token',
      refresh_token: first.body.refresh_token,
      client_id: confidential.client_id,
      client_secret: confidential.client_secret!,
    });
    expect(refreshed.status).toBe(200);
    expect(issuer.grants.at(-1)).toMatchObject({ grant_type: 'refresh_token', auth_method: 'client_secret_post', refresh_token: first.body.refresh_token, ok: true });
    expect(refreshed.body.refresh_token).not.toBe(first.body.refresh_token);
    expect(refreshed.body.access_token).not.toBe(first.body.access_token);
    const reuse = await tokenPost(issuer, { grant_type: 'refresh_token', refresh_token: first.body.refresh_token }, basic(confidential));
    expect(reuse).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
    const wrongSecret = await tokenPost(issuer, { grant_type: 'refresh_token', refresh_token: refreshed.body.refresh_token }, basic({ ...confidential, client_secret: 'wrong' }));
    expect(wrongSecret).toMatchObject({ status: 401, body: { error: 'invalid_client' } });
  });

  it('expireAccessTokens makes issued access tokens inactive; introspection agrees', async () => {
    const { body } = await tokenPost(issuer, { grant_type: 'client_credentials', scope: 'read' }, basic(confidential));
    expect(issuer.isActive(body.access_token)).toBe(true);
    const live = await fetch(issuer.introspectionEndpoint, { method: 'POST', headers: formHeaders, body: form({ token: body.access_token }) });
    expect(await live.json()).toMatchObject({ active: true, client_id: confidential.client_id, scope: 'read' });
    issuer.expireAccessTokens();
    expect(issuer.isActive(body.access_token)).toBe(false);
    expect(issuer.introspect(body.access_token)).toEqual({ active: false });
  });

  it('registers a client per RFC 7591 and refuses a registration without redirect_uris', async () => {
    const res = await fetch(issuer.registrationEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_post', client_name: 'Kortix' }),
    });
    expect(res.status).toBe(201);
    const issued = (await res.json()) as Record<string, any>;
    expect(issued).toMatchObject({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_post', client_name: 'Kortix' });
    expect(issued.client_secret).toBeTruthy();
    expect(issuer.clients.get(issued.client_id)).toBeDefined();
    const bad = await fetch(issuer.registrationEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid_redirect_uri' });
  });

  it('revokes a refresh token per RFC 7009 (unknown tokens still answer 200)', async () => {
    const { verifier, challenge } = pkce();
    const { location } = await authorize(issuer, confidential, challenge);
    const tokens = await tokenPost(
      issuer,
      { grant_type: 'authorization_code', code: location!.searchParams.get('code')!, redirect_uri: REDIRECT, code_verifier: verifier },
      basic(confidential),
    );
    const revoke = (value: string) =>
      fetch(issuer.revocationEndpoint, { method: 'POST', headers: { ...formHeaders, ...basic(confidential) }, body: form({ token: value }) });
    expect((await revoke(tokens.body.refresh_token)).status).toBe(200);
    expect((await revoke('never-issued')).status).toBe(200);
    const after = await tokenPost(issuer, { grant_type: 'refresh_token', refresh_token: tokens.body.refresh_token }, basic(confidential));
    expect(after.body.error).toBe('invalid_grant');
    expect((await revoke(tokens.body.access_token)).status).toBe(200);
    expect(issuer.isActive(tokens.body.access_token)).toBe(false);
  });

  it('failNext fails exactly one request with the configured status and error', async () => {
    issuer.failNext('token', { status: 503, error: 'temporarily_unavailable' });
    const failed = await tokenPost(issuer, { grant_type: 'client_credentials' }, basic(confidential));
    expect(failed).toMatchObject({ status: 503, body: { error: 'temporarily_unavailable' } });
    expect(issuer.grants.at(-1)).toMatchObject({ ok: false, error: 'temporarily_unavailable' });
    const next = await tokenPost(issuer, { grant_type: 'client_credentials' }, basic(confidential));
    expect(next.status).toBe(200);
    issuer.failNext('authorize', { error: 'server_error' });
    const { location } = await authorize(issuer, confidential, pkce().challenge);
    expect(location!.searchParams.get('error')).toBe('server_error');
  });
});

describe('fake MCP server', () => {
  let issuer: FakeOAuthIssuer;
  let open: FakeMcpServer;
  let guarded: FakeMcpServer;
  const rpc = (id: number | undefined, method: string, params?: unknown) =>
    JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) });
  const post = (url: string, body: string, headers: Record<string, string> = {}) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body });
  const tools = [{ name: 'add', description: 'Add two numbers', handler: (a: Record<string, unknown>) => ({ sum: Number(a.a) + Number(a.b) }) }];

  beforeAll(async () => {
    issuer = await startOAuthIssuer();
    open = await startMcpServer({ tools });
    guarded = await startMcpServer({ tools, auth: { issuer, scopes: ['read'] } });
  });
  afterAll(async () => {
    await Promise.all([open.close(), guarded.close(), issuer.close()]);
  });

  it('answers initialize, notifications/initialized, tools/list and tools/call without auth', async () => {
    const init = await post(open.url, rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }));
    expect(((await init.json()) as any).result.capabilities).toEqual({ tools: {} });
    expect((await post(open.url, rpc(undefined, 'notifications/initialized'))).status).toBe(202);
    const list = (await (await post(open.url, rpc(2, 'tools/list'))).json()) as any;
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(['add']);
    const call = (await (await post(open.url, rpc(3, 'tools/call', { name: 'add', arguments: { a: 2, b: 3 } }))).json()) as any;
    expect(JSON.parse(call.result.content[0].text)).toEqual({ sum: 5 });
    expect(open.calls).toEqual([{ name: 'add', arguments: { a: 2, b: 3 }, authorization: undefined }]);
    expect(open.methods()).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    const unknown = (await (await post(open.url, rpc(4, 'tools/call', { name: 'nope' }))).json()) as any;
    expect(unknown.error.code).toBe(-32602);
  });

  it('with issuer auth: 401 + resource_metadata, RFC 9728 metadata, then success with an issued token', async () => {
    const refused = await post(guarded.url, rpc(1, 'tools/list'));
    expect(refused.status).toBe(401);
    expect(refused.headers.get('www-authenticate')).toContain(`resource_metadata="${guarded.resourceMetadataUrl}"`);
    const meta = (await (await fetch(guarded.resourceMetadataUrl)).json()) as any;
    expect(meta).toMatchObject({ resource: guarded.url, authorization_servers: [issuer.issuer] });
    const client = issuer.addClient({ redirect_uris: [REDIRECT] });
    const res = await fetch(issuer.tokenEndpoint, { method: 'POST', headers: { ...formHeaders, ...basic(client) }, body: form({ grant_type: 'client_credentials' }) });
    const { access_token } = (await res.json()) as { access_token: string };
    const call = await post(guarded.url, rpc(2, 'tools/call', { name: 'add', arguments: { a: 1, b: 1 } }), { authorization: `Bearer ${access_token}` });
    expect(call.status).toBe(200);
    expect(guarded.calls.at(-1)!.authorization).toBe(`Bearer ${access_token}`);
    issuer.expireAccessTokens();
    const expired = await post(guarded.url, rpc(3, 'tools/list'), { authorization: `Bearer ${access_token}` });
    expect(expired.status).toBe(401);
    expect(expired.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('with a fixed bearer: a plain 401 without the header, 200 with it', async () => {
    const fixed = await startMcpServer({ tools, auth: { token: 'bound-secret' } });
    try {
      const refused = await post(fixed.url, rpc(1, 'initialize'));
      expect(refused.status).toBe(401);
      expect(refused.headers.get('www-authenticate')).toBeNull();
      expect((await post(fixed.url, rpc(1, 'initialize'), { authorization: 'Bearer bound-secret' })).status).toBe(200);
    } finally {
      await fixed.close();
    }
  });
});

describe('fake OpenAPI upstream', () => {
  let upstream: FakeOpenApiUpstream;
  beforeAll(async () => {
    upstream = await startOpenApiUpstream();
  });
  afterAll(() => upstream.close());

  it('serves the spec with servers[0] = its origin and echoes requests it records', async () => {
    const spec = (await (await fetch(upstream.specUrl)).json()) as any;
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.servers[0].url).toBe(upstream.origin);
    expect(Object.keys(spec.paths)).toEqual(['/echo', '/items/{id}']);
    const res = await fetch(`${upstream.url}/echo?q=hello`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer abc' },
      body: JSON.stringify({ x: 1 }),
    });
    expect(await res.json()).toMatchObject({
      method: 'POST',
      path: '/echo',
      url: '/echo?q=hello',
      query: { q: 'hello' },
      headers: { authorization: 'Bearer abc' },
      body: { x: 1 },
    });
    expect(upstream.echoed().map((r) => `${r.method} ${r.url}`)).toEqual(['POST /echo?q=hello']);
    expect(upstream.requests).toHaveLength(2);
    expect(upstream.lastRequest()!.body).toBe('{"x":1}');
  });

  it('checks the bearer against an issuer when auth is on; the spec stays public', async () => {
    const issuer = await startOAuthIssuer();
    const guarded = await startOpenApiUpstream({ auth: { issuer } });
    try {
      expect((await fetch(guarded.specUrl)).status).toBe(200);
      const refused = await fetch(`${guarded.url}/items/1`);
      expect(refused.status).toBe(401);
      expect(refused.headers.get('www-authenticate')).toContain('resource_metadata=');
      const client = issuer.addClient({ redirect_uris: [REDIRECT] });
      const { access_token } = (await (await fetch(issuer.tokenEndpoint, { method: 'POST', headers: { ...formHeaders, ...basic(client) }, body: form({ grant_type: 'client_credentials' }) })).json()) as { access_token: string };
      const ok = await fetch(`${guarded.url}/items/1`, { headers: { authorization: `Bearer ${access_token}` } });
      expect(await ok.json()).toMatchObject({ method: 'GET', path: '/items/1' });
    } finally {
      await Promise.all([guarded.close(), issuer.close()]);
    }
  });
});
