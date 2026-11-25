import { describe, expect, test } from 'bun:test';
import { buildOAuth2AuthorizationRequest, exchangeOAuth2AuthorizationCode } from './oauth2-lifecycle';
import { HTTPException } from 'hono/http-exception';
import {
  registerOAuth2Client,
  selectTokenEndpointAuthMethod,
} from './oauth2-registration';

describe('selectTokenEndpointAuthMethod', () => {
  test('prefers a confidential client when the server allows one', () => {
    expect(selectTokenEndpointAuthMethod(['client_secret_post', 'client_secret_basic', 'none'])).toBe(
      'client_secret_basic',
    );
    expect(selectTokenEndpointAuthMethod(['client_secret_post', 'none'])).toBe('client_secret_post');
    expect(selectTokenEndpointAuthMethod(['none'])).toBe('none');
  });
  test('RFC 8414 default when the server does not say', () => {
    expect(selectTokenEndpointAuthMethod(undefined)).toBe('client_secret_basic');
  });
  test('falls back to none when nothing Kortix supports is offered', () => {
    expect(selectTokenEndpointAuthMethod(['tls_client_auth'])).toBe('none');
  });
});

describe('registerOAuth2Client — RFC 7591 dynamic client registration', () => {
  test('posts a standard registration and returns the issued client', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const result = await registerOAuth2Client(
      {
        registrationEndpoint: 'https://api.example.com/oauth/register',
        redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
        scopes: ['openid', 'offline_access', 'mcp:execute'],
        tokenEndpointAuthMethodsSupported: ['client_secret_post', 'client_secret_basic', 'none'],
      },
      {
        fetchImpl: async (url, init) => {
          seen = { url: String(url), init };
          return new Response(
            JSON.stringify({
              client_id: 'issued-client',
              client_secret: 'issued-secret',
              client_secret_expires_at: 0,
              token_endpoint_auth_method: 'client_secret_basic',
              redirect_uris: ['https://api.kortix.com/v1/connectors/oauth2/callback'],
              registration_access_token: 'reg-token',
              registration_client_uri: 'https://authn.example.com/oauth2/register/issued-client',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        },
      },
    );
    expect(seen!.url).toBe('https://api.example.com/oauth/register');
    expect(seen!.init?.method).toBe('POST');
    const body = JSON.parse(String(seen!.init?.body));
    expect(body).toEqual({
      client_name: 'Kortix',
      client_uri: 'https://kortix.com',
      redirect_uris: ['https://api.kortix.com/v1/connectors/oauth2/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      application_type: 'web',
      token_endpoint_auth_method: 'client_secret_basic',
      scope: 'openid offline_access mcp:execute',
    });
    expect(result).toEqual({
      client_id: 'issued-client',
      client_secret: 'issued-secret',
      token_endpoint_auth_method: 'client_secret_basic',
      registration_access_token: 'reg-token',
      registration_client_uri: 'https://authn.example.com/oauth2/register/issued-client',
    });
  });

  test('a loopback callback registers as a native client (SEP-837)', async () => {
    let body: Record<string, unknown> = {};
    await registerOAuth2Client(
      {
        registrationEndpoint: 'https://api.example.com/oauth/register',
        // A self-hosted Kortix on loopback. Registered as `web`, an
        // OIDC-based server rejects the redirect URI outright.
        redirectUri: 'http://localhost:8008/v1/connectors/oauth2/callback',
      },
      {
        fetchImpl: async (_url, init) => {
          body = JSON.parse(String(init?.body));
          return Response.json({ client_id: 'x', client_secret: 'y' });
        },
      },
    );
    expect(body.application_type).toBe('native');
  });

  test('accepts HTTP 200 and a public client (no secret, method none)', async () => {
    const result = await registerOAuth2Client(
      {
        registrationEndpoint: 'https://api.example.com/oauth/register',
        redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
        tokenEndpointAuthMethodsSupported: ['none'],
      },
      {
        fetchImpl: async () =>
          Response.json({ client_id: 'public-client', token_endpoint_auth_method: 'none' }),
      },
    );
    expect(result).toEqual({ client_id: 'public-client', token_endpoint_auth_method: 'none' });
  });

  test('the server-issued auth method wins; a secret method without a secret is an error', async () => {
    await expect(
      registerOAuth2Client(
        {
          registrationEndpoint: 'https://api.example.com/oauth/register',
          redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
        },
        {
          fetchImpl: async () =>
            Response.json({ client_id: 'x', token_endpoint_auth_method: 'client_secret_post' }),
        },
      ),
    ).rejects.toThrow('client_secret');
  });

  test('omits scope when none are requested and surfaces the provider error code', async () => {
    let body: Record<string, unknown> = {};
    await expect(
      registerOAuth2Client(
        {
          registrationEndpoint: 'https://api.example.com/oauth/register',
          redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
        },
        {
          fetchImpl: async (_url, init) => {
            body = JSON.parse(String(init?.body));
            return Response.json(
              { error: 'invalid_redirect_uri', error_description: 'nope <script>' },
              { status: 400 },
            );
          },
        },
      ),
    ).rejects.toThrow('Connect with an API token instead');
    expect('scope' in body).toBe(false);
  });

  test('a provider that refuses the registration is a typed 400, not a server error (KRTX-4709)', async () => {
    // The prod failure: the server advertises a registration_endpoint but its
    // registration endpoint rejects the RFC 7591 request. That is a property of
    // the server the user configured — the connect flow must answer it as a
    // typed 400 (hono ignores HTTPException for Sentry), not an unhandled 500.
    const error = await registerOAuth2Client(
      {
        registrationEndpoint: 'https://api.example.com/oauth/register',
        redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
      },
      {
        fetchImpl: async () =>
          Response.json({ error: 'invalid_client_metadata' }, { status: 400 }),
      },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPException);
    expect((error as HTTPException).status).toBe(400);
    expect((error as Error).message).toContain('invalid_client_metadata');
  });

  test('a provider registration outage keeps the upstream status in the message, answered as a typed 400', async () => {
    const error = await registerOAuth2Client(
      {
        registrationEndpoint: 'https://api.example.com/oauth/register',
        redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
      },
      { fetchImpl: async () => new Response('boom', { status: 502 }) },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPException);
    // 400, not 502: handleHttpException captures any 5xx HTTPException to
    // Sentry, which would re-create the paging pattern this fix removes.
    expect((error as HTTPException).status).toBe(400);
    expect((error as Error).message).toContain('502');
  });

  test('a 200 response with no client_id is a typed 400 naming the defect', async () => {
    const error = await registerOAuth2Client(
      {
        registrationEndpoint: 'https://api.example.com/oauth/register',
        redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
      },
      { fetchImpl: async () => Response.json({}) },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HTTPException);
    expect((error as HTTPException).status).toBe(400);
    expect((error as Error).message).toContain('client_id');
  });
});

describe('CIMD hosted clients', () => {
  test('uses the metadata document instead of registering a hosted redirect', async () => {
    let registrationCalls = 0;
    const client = await registerOAuth2Client({
      registrationEndpoint: 'https://auth.example.test/register',
      redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
      clientIdMetadataDocumentSupported: true,
    }, { fetchImpl: async () => {
      registrationCalls++;
      return Response.json({ error: 'invalid_redirect_uri' }, { status: 400 });
    } });
    expect(client).toEqual({
      client_id: 'https://api.kortix.com/.well-known/oauth-client.json',
      token_endpoint_auth_method: 'none',
    });
    expect(registrationCalls).toBe(0);
    const application = {
      ...client,
      authorization_url: 'https://auth.example.test/authorize',
      token_url: 'https://auth.example.test/token',
    };
    const callbackUrl = 'https://api.kortix.com/v1/connectors/oauth2/callback';
    const authorization = buildOAuth2AuthorizationRequest(application, { callbackUrl });
    const url = new URL(authorization.authorizationUrl);
    expect(url.searchParams.get('client_id')).toBe(client.client_id);
    expect(url.searchParams.get('redirect_uri')).toBe(callbackUrl);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const tokens = await exchangeOAuth2AuthorizationCode(application, {
      code: 'synthetic-code', callbackUrl, pkceVerifier: authorization.pkceVerifier,
    }, { fetchImpl: async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('client_id')).toBe(client.client_id);
      expect(body.get('redirect_uri')).toBe(callbackUrl);
      expect(body.get('code_verifier')).toBe(authorization.pkceVerifier);
      expect(body.has('client_secret')).toBe(false);
      return Response.json({ access_token: 'synthetic-token', token_type: 'Bearer' });
    } });
    expect(tokens.access_token).toBe('synthetic-token');
  });

  test('returns a typed registration refusal with a token fallback', async () => {
    const error = await registerOAuth2Client({
      registrationEndpoint: 'https://auth.example.test/register',
      redirectUri: 'https://api.kortix.com/v1/connectors/oauth2/callback',
    }, { fetchImpl: async () => Response.json({ error: 'invalid_redirect_uri' }, { status: 400 }) })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(HTTPException);
    if (!(error instanceof HTTPException)) throw new Error('Expected HTTPException');
    expect(error.status).toBe(400);
    expect(await error.getResponse().json()).toEqual({
      code: 'oauth_client_registration_refused',
      error: 'The authorization server auth.example.test refused the hosted OAuth callback. Connect with an API token instead.',
    });
  });
});

test('DCR refuses the reserved hosted metadata client ID', async () => {
  await expect(registerOAuth2Client({
    registrationEndpoint: 'https://attacker.example/register',
    redirectUri: 'https://api.kortix.test/v1/connectors/oauth2/callback',
    tokenEndpointAuthMethodsSupported: ['none'],
  }, { fetchImpl: async () => Response.json({
    client_id: 'https://api.kortix.test/.well-known/oauth-client.json',
    token_endpoint_auth_method: 'none',
  }, { status: 201 }) })).rejects.toThrow('reserved hosted client');
});
