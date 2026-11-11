/**
 * Bearer checks shared by the protected fakes (`mcp-server`, `openapi-upstream`).
 *
 * `{ issuer }`: the token must be live at that fake issuer, and a refusal
 * names the RFC 9728 protected-resource metadata in `WWW-Authenticate`.
 * `{ token }`: a fixed token (a bound secret); a refusal is a plain 401.
 */
import type { ServerResponse } from 'node:http';
import { type RecordedRequest, bearerToken, sendJson } from './http';
import type { FakeOAuthIssuer } from './oauth-issuer';

export type BearerAuth = { issuer: FakeOAuthIssuer; scopes?: string[] } | { token: string };

/** RFC 9728 §3.1: the metadata path for a resource path ('/mcp' → '/.well-known/oauth-protected-resource/mcp'). */
export function protectedResourceMetadataPath(resourcePath: string): string {
  const suffix = resourcePath === '/' ? '' : resourcePath.replace(/\/+$/, '');
  return `/.well-known/oauth-protected-resource${suffix}`;
}

export function protectedResourceMetadata(auth: BearerAuth, resource: string): Record<string, unknown> | null {
  if (!('issuer' in auth)) return null;
  return {
    resource,
    authorization_servers: [auth.issuer.issuer],
    bearer_methods_supported: ['header'],
    ...(auth.scopes?.length ? { scopes_supported: auth.scopes } : {}),
  };
}

/**
 * True when the request carries an accepted bearer. Otherwise writes the 401
 * and returns false.
 */
export function checkBearer(
  auth: BearerAuth | undefined,
  req: RecordedRequest,
  res: ServerResponse,
  metadataUrl: string,
): boolean {
  if (!auth) return true;
  const presented = bearerToken(req.headers);
  if ('token' in auth) {
    if (presented === auth.token) return true;
    sendJson(res, 401, { error: 'unauthorized' });
    return false;
  }
  if (presented && auth.issuer.isActive(presented)) return true;
  const params = [`resource_metadata="${metadataUrl}"`];
  if (presented) params.push('error="invalid_token"');
  if (auth.scopes?.length) params.push(`scope="${auth.scopes.join(' ')}"`);
  sendJson(res, 401, { error: presented ? 'invalid_token' : 'unauthorized' }, { 'www-authenticate': `Bearer ${params.join(', ')}` });
  return false;
}
