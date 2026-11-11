/**
 * A loopback OAuth 2.0 authorization server for flows and unit tests.
 *
 * Implements the parts a Kortix connector sign-in touches:
 *   - RFC 8414 discovery: `GET /.well-known/oauth-authorization-server`
 *   - RFC 6749 §4.1 + RFC 7636 (PKCE S256): `GET /authorize`, then
 *     `POST /token` with `grant_type=authorization_code`
 *   - RFC 6749 §6 refresh WITH rotation: a used refresh token is dead
 *   - RFC 6749 §4.4 `client_credentials`
 *   - RFC 7591 dynamic client registration: `POST /register`
 *   - RFC 7009 revocation: `POST /revoke`
 *   - RFC 7662 introspection: `POST /introspect`, or `isActive(token)` in-process
 *   - RFC 9207: the authorization response carries `iss`
 *
 * Client authentication at `/token` and `/revoke`: `client_secret_basic`,
 * `client_secret_post`, or `none` for a public client.
 *
 * `/authorize` decides at once (no login page): `consent` 'approve' redirects
 * with `code` + `state`, 'deny' with `error=access_denied`. A flow GETs the
 * authorization URL with `redirect: 'manual'` and follows the 302 itself.
 *
 * `failNext(endpoint, …)` makes the next request to that endpoint fail once.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import {
  type LoopbackTls,
  type RecordedRequest,
  parseForm,
  parseJson,
  sendJson,
  startLoopback,
} from './http';

export type ClientAuthMethod = 'none' | 'client_secret_basic' | 'client_secret_post';

export interface FakeOAuthClient {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: ClientAuthMethod;
  client_name?: string;
  scope?: string;
}

export type IssuerEndpoint = 'metadata' | 'authorize' | 'token' | 'register' | 'revoke' | 'introspect';

export interface IssuerFailure {
  /** HTTP status. Ignored for `authorize`, which redirects with the error. */
  status?: number;
  error: string;
  error_description?: string;
}

/** One `/token` request the issuer accepted or refused. */
export interface TokenGrantRecord {
  grant_type: string;
  client_id: string | null;
  auth_method: ClientAuthMethod | null;
  /** The refresh token presented, for `refresh_token` grants. */
  refresh_token?: string;
  ok: boolean;
  error?: string;
}

export interface OAuthIssuerOptions {
  /** Clients known before any registration. */
  clients?: FakeOAuthClient[];
  /** Access-token lifetime in seconds (`expires_in`). Default 3600. */
  accessTokenTtlSeconds?: number;
  /** Issue a refresh token with authorization_code grants. Default true. */
  issueRefreshTokens?: boolean;
  /** Rotate the refresh token on every refresh. Default true. */
  rotateRefreshTokens?: boolean;
  scopesSupported?: string[];
  /** Serve over TLS with this key and certificate. */
  tls?: LoopbackTls;
  /** Injectable clock in ms. Default Date.now. */
  now?: () => number;
}

interface AccessTokenRow {
  client_id: string;
  scope: string;
  resource?: string;
  expires_at: number;
  revoked: boolean;
}

interface RefreshTokenRow {
  client_id: string;
  scope: string;
  resource?: string;
  revoked: boolean;
}

interface CodeRow {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource?: string;
  expires_at: number;
  used: boolean;
}

export interface FakeOAuthIssuer {
  /** The issuer identifier: equal to the origin. */
  url: string;
  issuer: string;
  metadataUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  introspectionEndpoint: string;
  requests: RecordedRequest[];
  /** Every `/token` request, in order. */
  grants: TokenGrantRecord[];
  clients: Map<string, FakeOAuthClient>;
  /** Add a client in-process (no RFC 7591 round trip). */
  addClient(client: Partial<FakeOAuthClient> & { redirect_uris: string[] }): FakeOAuthClient;
  /** True when `token` is a live, unexpired, unrevoked access token. */
  isActive(token: string): boolean;
  /** RFC 7662 view of a token. */
  introspect(token: string): Record<string, unknown>;
  /** The next request to `endpoint` fails once with this error. */
  failNext(endpoint: IssuerEndpoint, failure: IssuerFailure): void;
  /** Make every issued access token expire now. Refresh tokens stay valid. */
  expireAccessTokens(): void;
  /** Change `expires_in` for tokens issued from now on. */
  setAccessTokenTtl(seconds: number): void;
  /** What `/authorize` answers: approve (default) or deny. */
  setConsent(consent: 'approve' | 'deny'): void;
  /** The access tokens issued so far, oldest first. */
  issuedAccessTokens(): string[];
  close(): Promise<void>;
}

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const token = (prefix: string) => `${prefix}_${randomBytes(24).toString('base64url')}`;

function oauthError(res: ServerResponse, status: number, error: string, description?: string, headers: Record<string, string> = {}) {
  sendJson(res, status, { error, ...(description ? { error_description: description } : {}) }, headers);
}

export async function startOAuthIssuer(options: OAuthIssuerOptions = {}): Promise<FakeOAuthIssuer> {
  const now = options.now ?? Date.now;
  let accessTtl = options.accessTokenTtlSeconds ?? 3600;
  let consent: 'approve' | 'deny' = 'approve';
  const issueRefresh = options.issueRefreshTokens ?? true;
  const rotateRefresh = options.rotateRefreshTokens ?? true;
  const clients = new Map<string, FakeOAuthClient>();
  const codes = new Map<string, CodeRow>();
  const accessTokens = new Map<string, AccessTokenRow>();
  const refreshTokens = new Map<string, RefreshTokenRow>();
  const failures = new Map<IssuerEndpoint, IssuerFailure>();
  const grants: TokenGrantRecord[] = [];
  let origin = '';

  const addClient: FakeOAuthIssuer['addClient'] = (input) => {
    const method = input.token_endpoint_auth_method ?? 'client_secret_basic';
    const client: FakeOAuthClient = {
      client_id: input.client_id ?? token('client'),
      redirect_uris: input.redirect_uris,
      token_endpoint_auth_method: method,
      ...(method === 'none' ? {} : { client_secret: input.client_secret ?? token('secret') }),
      ...(input.client_name ? { client_name: input.client_name } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
    };
    clients.set(client.client_id, client);
    return client;
  };
  for (const client of options.clients ?? []) clients.set(client.client_id, client);

  const takeFailure = (endpoint: IssuerEndpoint) => {
    const failure = failures.get(endpoint);
    if (failure) failures.delete(endpoint);
    return failure;
  };

  const isActive = (value: string) => {
    const row = accessTokens.get(value);
    return !!row && !row.revoked && row.expires_at > now();
  };

  const introspect = (value: string): Record<string, unknown> => {
    const access = accessTokens.get(value);
    if (access) {
      if (!isActive(value)) return { active: false };
      return {
        active: true,
        token_type: 'Bearer',
        client_id: access.client_id,
        scope: access.scope,
        exp: Math.floor(access.expires_at / 1000),
        iss: origin,
        ...(access.resource ? { aud: access.resource } : {}),
      };
    }
    const refresh = refreshTokens.get(value);
    if (refresh && !refresh.revoked) {
      return { active: true, token_type: 'refresh_token', client_id: refresh.client_id, scope: refresh.scope, iss: origin };
    }
    return { active: false };
  };

  const issueTokens = (clientId: string, scope: string, resource: string | undefined, withRefresh: boolean) => {
    const access = token('at');
    accessTokens.set(access, { client_id: clientId, scope, resource, expires_at: now() + accessTtl * 1000, revoked: false });
    const body: Record<string, unknown> = { access_token: access, token_type: 'Bearer', expires_in: accessTtl, scope };
    if (withRefresh) {
      const refresh = token('rt');
      refreshTokens.set(refresh, { client_id: clientId, scope, resource, revoked: false });
      body.refresh_token = refresh;
    }
    return body;
  };

  /** RFC 6749 §2.3.1: Basic header first, then body credentials, then a public client_id. */
  const authenticateClient = (
    req: RecordedRequest,
    form: Record<string, string>,
  ): { client: FakeOAuthClient; method: ClientAuthMethod } | { error: string; basic: boolean } => {
    const basic = /^Basic\s+(.+)$/i.exec(req.headers.authorization ?? '');
    if (basic) {
      const decoded = Buffer.from(basic[1]!, 'base64').toString('utf8');
      const split = decoded.indexOf(':');
      const id = decodeURIComponent(decoded.slice(0, split));
      const secret = decodeURIComponent(decoded.slice(split + 1));
      const client = clients.get(id);
      if (!client || !client.client_secret || client.client_secret !== secret) return { error: 'invalid_client', basic: true };
      return { client, method: 'client_secret_basic' };
    }
    const client = form.client_id ? clients.get(form.client_id) : undefined;
    if (!client) return { error: 'invalid_client', basic: false };
    if (form.client_secret !== undefined) {
      if (client.client_secret !== form.client_secret) return { error: 'invalid_client', basic: false };
      return { client, method: 'client_secret_post' };
    }
    if (client.token_endpoint_auth_method !== 'none') return { error: 'invalid_client', basic: false };
    return { client, method: 'none' };
  };

  const metadata = () => ({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    revocation_endpoint: `${origin}/revoke`,
    introspection_endpoint: `${origin}/introspect`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    scopes_supported: options.scopesSupported ?? ['read', 'write'],
    authorization_response_iss_parameter_supported: true,
  });

  const handleAuthorize = (req: RecordedRequest, res: ServerResponse) => {
    const q = req.query;
    const client = q.client_id ? clients.get(q.client_id) : undefined;
    // RFC 6749 §4.1.2.1: a bad client or redirect_uri is never redirected to.
    if (!client) return oauthError(res, 400, 'invalid_client', 'unknown client_id');
    if (!q.redirect_uri || !client.redirect_uris.includes(q.redirect_uri)) {
      return oauthError(res, 400, 'invalid_request', 'redirect_uri is not registered for this client');
    }
    const redirect = (params: Record<string, string>) => {
      const location = new URL(q.redirect_uri!);
      for (const [key, value] of Object.entries(params)) location.searchParams.set(key, value);
      if (q.state) location.searchParams.set('state', q.state);
      location.searchParams.set('iss', origin);
      res.writeHead(302, { location: location.href });
      res.end();
    };
    const failure = takeFailure('authorize');
    if (failure) {
      return redirect({ error: failure.error, ...(failure.error_description ? { error_description: failure.error_description } : {}) });
    }
    if (q.response_type !== 'code') return redirect({ error: 'unsupported_response_type' });
    if (!q.state) return redirect({ error: 'invalid_request', error_description: 'state is required' });
    if (!q.code_challenge || q.code_challenge_method !== 'S256') {
      return redirect({ error: 'invalid_request', error_description: 'PKCE S256 code_challenge is required' });
    }
    if (consent === 'deny') return redirect({ error: 'access_denied' });
    const code = token('code');
    codes.set(code, {
      client_id: client.client_id,
      redirect_uri: q.redirect_uri,
      code_challenge: q.code_challenge,
      scope: q.scope ?? client.scope ?? '',
      resource: q.resource,
      expires_at: now() + 10 * 60_000,
      used: false,
    });
    return redirect({ code });
  };

  const handleToken = (req: RecordedRequest, res: ServerResponse) => {
    const form = parseForm(req.body);
    const grant: TokenGrantRecord = {
      grant_type: form.grant_type ?? '',
      client_id: null,
      auth_method: null,
      ...(form.refresh_token ? { refresh_token: form.refresh_token } : {}),
      ok: false,
    };
    grants.push(grant);
    const refuse = (status: number, error: string, description?: string, headers?: Record<string, string>) => {
      grant.error = error;
      oauthError(res, status, error, description, headers);
    };
    const failure = takeFailure('token');
    if (failure) return refuse(failure.status ?? 400, failure.error, failure.error_description);
    const auth = authenticateClient(req, form);
    if ('error' in auth) {
      return refuse(401, auth.error, 'client authentication failed', auth.basic ? { 'www-authenticate': 'Basic realm="fake-issuer"' } : {});
    }
    grant.client_id = auth.client.client_id;
    grant.auth_method = auth.method;
    const succeed = (body: Record<string, unknown>) => {
      grant.ok = true;
      sendJson(res, 200, body);
    };
    switch (form.grant_type) {
      case 'authorization_code': {
        const row = form.code ? codes.get(form.code) : undefined;
        if (!row || row.used || row.expires_at <= now() || row.client_id !== auth.client.client_id) {
          return refuse(400, 'invalid_grant', 'authorization code is invalid, used, or expired');
        }
        row.used = true;
        if (form.redirect_uri !== row.redirect_uri) return refuse(400, 'invalid_grant', 'redirect_uri does not match');
        if (!form.code_verifier || s256(form.code_verifier) !== row.code_challenge) {
          return refuse(400, 'invalid_grant', 'PKCE code_verifier does not match the code_challenge');
        }
        return succeed(issueTokens(row.client_id, row.scope, form.resource ?? row.resource, issueRefresh));
      }
      case 'refresh_token': {
        const row = form.refresh_token ? refreshTokens.get(form.refresh_token) : undefined;
        if (!row || row.revoked || row.client_id !== auth.client.client_id) {
          return refuse(400, 'invalid_grant', 'refresh token is invalid or was already used');
        }
        if (rotateRefresh) row.revoked = true;
        const body = issueTokens(row.client_id, form.scope ?? row.scope, form.resource ?? row.resource, rotateRefresh);
        return succeed(body);
      }
      case 'client_credentials': {
        if (auth.method === 'none') return refuse(401, 'invalid_client', 'client_credentials needs a confidential client');
        return succeed(issueTokens(auth.client.client_id, form.scope ?? auth.client.scope ?? '', form.resource, false));
      }
      default:
        return refuse(400, 'unsupported_grant_type');
    }
  };

  const handleRegister = (req: RecordedRequest, res: ServerResponse) => {
    const failure = takeFailure('register');
    if (failure) return oauthError(res, failure.status ?? 400, failure.error, failure.error_description);
    const body = parseJson(req.body) as Record<string, unknown> | undefined;
    const redirectUris = Array.isArray(body?.redirect_uris)
      ? body.redirect_uris.filter((u): u is string => typeof u === 'string')
      : [];
    if (redirectUris.length === 0) return oauthError(res, 400, 'invalid_redirect_uri', 'redirect_uris is required');
    const requested = body?.token_endpoint_auth_method;
    const method: ClientAuthMethod =
      requested === 'none' || requested === 'client_secret_post' ? requested : 'client_secret_basic';
    const client = addClient({
      redirect_uris: redirectUris,
      token_endpoint_auth_method: method,
      ...(typeof body?.client_name === 'string' ? { client_name: body.client_name } : {}),
      ...(typeof body?.scope === 'string' ? { scope: body.scope } : {}),
    });
    sendJson(res, 201, {
      ...client,
      client_id_issued_at: Math.floor(now() / 1000),
      ...(client.client_secret ? { client_secret_expires_at: 0 } : {}),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  };

  const handleRevoke = (req: RecordedRequest, res: ServerResponse) => {
    const failure = takeFailure('revoke');
    if (failure) return oauthError(res, failure.status ?? 400, failure.error, failure.error_description);
    const form = parseForm(req.body);
    const auth = authenticateClient(req, form);
    if ('error' in auth) return oauthError(res, 401, auth.error);
    // RFC 7009 §2.2: an unknown token is still a 200.
    const value = form.token ?? '';
    const access = accessTokens.get(value);
    if (access && access.client_id === auth.client.client_id) access.revoked = true;
    const refresh = refreshTokens.get(value);
    if (refresh && refresh.client_id === auth.client.client_id) refresh.revoked = true;
    res.writeHead(200);
    res.end();
  };

  const handleIntrospect = (req: RecordedRequest, res: ServerResponse) => {
    const failure = takeFailure('introspect');
    if (failure) return oauthError(res, failure.status ?? 400, failure.error, failure.error_description);
    sendJson(res, 200, introspect(parseForm(req.body).token ?? ''));
  };

  const server = await startLoopback(
    (req, res) => {
      const route = `${req.method} ${req.path}`;
      switch (route) {
        case 'GET /.well-known/oauth-authorization-server': {
          const failure = takeFailure('metadata');
          if (failure) return oauthError(res, failure.status ?? 500, failure.error, failure.error_description);
          return sendJson(res, 200, metadata());
        }
        case 'GET /authorize':
          return handleAuthorize(req, res);
        case 'POST /token':
          return handleToken(req, res);
        case 'POST /register':
          return handleRegister(req, res);
        case 'POST /revoke':
          return handleRevoke(req, res);
        case 'POST /introspect':
          return handleIntrospect(req, res);
        default:
          return oauthError(res, 404, 'not_found', route);
      }
    },
    { tls: options.tls },
  );
  origin = server.origin;

  return {
    url: origin,
    issuer: origin,
    metadataUrl: `${origin}/.well-known/oauth-authorization-server`,
    authorizationEndpoint: `${origin}/authorize`,
    tokenEndpoint: `${origin}/token`,
    registrationEndpoint: `${origin}/register`,
    revocationEndpoint: `${origin}/revoke`,
    introspectionEndpoint: `${origin}/introspect`,
    requests: server.requests,
    grants,
    clients,
    addClient,
    isActive,
    introspect,
    failNext: (endpoint, failure) => void failures.set(endpoint, failure),
    expireAccessTokens: () => {
      for (const row of accessTokens.values()) row.expires_at = Math.min(row.expires_at, now() - 1);
    },
    setAccessTokenTtl: (seconds) => void (accessTtl = seconds),
    setConsent: (value) => void (consent = value),
    issuedAccessTokens: () => [...accessTokens.keys()],
    close: server.close,
  };
}
