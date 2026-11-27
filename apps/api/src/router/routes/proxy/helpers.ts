import { HTTPException } from 'hono/http-exception';
import { config } from '../../../config';
import { getTraceHeaders } from '../../../lib/request-context';
import { validateAccountToken } from '../../../repositories/account-tokens';
import { keyScopeAllows } from '../../../iam/key-scope';
import { validateSecretKey } from '../../../repositories/api-keys';
import { isAccountToken, isKortixToken } from '../../../shared/crypto';
import { type ProxyServiceConfig, matchAllowedRoute } from '../../config/proxy-services';
import type { AuthResult } from './app';
import { bearerToken } from '../../../shared/bearer-token';

// Re-export for handlers (kept here so handlers import from one place)
export { matchAllowedRoute };
export { reserveToolProxyCredits, refundToolReservation, injectApiKey } from '../../services/proxy-billing';

/**
 * Resolve ANY Kortix credential to the account it bills.
 *
 * The platform mints two shapes and they live in different tables:
 *   - `kortix_pat_…`  → `account_tokens`   (`validateAccountToken`)
 *   - `kortix_…` / `kortix_sb_…` → `kortix_api_keys` (`validateSecretKey`)
 *
 * The in-sandbox `KORTIX_TOKEN` — the credential every built-in tool presents
 * to this proxy — is the FIRST shape: a session-scoped PAT auto-minted at
 * session create (projects/routes/project-credentials.ts). This resolver only ever consulted
 * the second table, so every built-in tool call answered
 * `401 Invalid Kortix token in x-api-key` while the same token authenticated
 * fine on every other route. Try the right validator for the prefix; never
 * widen what counts as valid (both validators still enforce active + not
 * expired + not revoked).
 */
export async function resolveKortixAccount(token: string): Promise<string | null> {
  if (isAccountToken(token)) {
    const pat = await validateAccountToken(token);
    // A scoped workspace key that may not run work (read, or a custom list
    // without session start) spends no proxy credits, as on the LLM gateway.
    if (pat.isValid && !keyScopeAllows(pat.scopes ?? null, 'project.session.start')) return null;
    return pat.isValid && pat.accountId ? pat.accountId : null;
  }
  const key = await validateSecretKey(token);
  return key.isValid && key.accountId ? key.accountId : null;
}

interface KortixTokenSource {
  extract: (c: any) => unknown | Promise<unknown>;
  invalid: string;
  /** Mode 2: the user's own key rides in Authorization; only the account is identified. */
  passthrough?: boolean;
}

// The client shapes the proxy accepts a Kortix credential in, in precedence order.
// The first shape that carries a Kortix-shaped token decides the outcome: a valid
// token authenticates, an invalid one is a hard 401 — never a free passthrough.
const KORTIX_TOKEN_SOURCES: KortixTokenSource[] = [
  {
    // Mode 1: a Kortix token (kortix_/kortix_sb_) in Authorization — full
    // Kortix-managed flow. Everyone else sends "Bearer ", the Replicate SDK
    // "Token ". If it looks like a Kortix token but fails validation → hard reject.
    invalid: 'Invalid Kortix token',
    extract: (c) => {
      const authHeader = c.req.header('Authorization');
      const bearer = bearerToken(authHeader);
      if (bearer !== null) return bearer;
      return authHeader?.startsWith('Token ') ? authHeader.slice(6) : undefined;
    },
  },
  {
    // Mode 1b: the Anthropic SDK sends the key via x-api-key; a Kortix token there
    // is Mode 1 (Kortix-managed).
    invalid: 'Invalid Kortix token in x-api-key',
    extract: (c) => c.req.header('x-api-key'),
  },
  {
    // Mode 1c: the Tavily SDK sends the key in the JSON body as "api_key". Check
    // the body for a Kortix token so sandbox tools can auth through the proxy.
    invalid: 'Invalid Kortix token in request body',
    extract: async (c) => {
      if (c.req.method !== 'POST') return undefined;
      const bodyText = await c.req.raw.clone().text();
      if (!bodyText || !bodyText.includes('kortix_')) return undefined;
      return JSON.parse(bodyText)?.api_key;
    },
  },
  {
    // Mode 2: the user's own API key is in Authorization (Bearer) or a
    // provider-specific header (e.g. Anthropic's x-api-key). The Kortix token
    // rides in X-Kortix-Token so we can identify and authorize the account.
    invalid: 'Invalid X-Kortix-Token',
    passthrough: true,
    extract: (c) => c.req.header('X-Kortix-Token'),
  },
];

export async function tryAuthenticate(c: any): Promise<AuthResult> {
  if (!config.DATABASE_URL) return { isKortixUser: false };

  for (const source of KORTIX_TOKEN_SOURCES) {
    let token: string | undefined;
    try {
      const raw = await source.extract(c);
      token = typeof raw === 'string' && isKortixToken(raw) ? raw : undefined;
    } catch (e) {
      // A body that is not JSON carries no api_key: not this shape, try the next.
      if (e instanceof HTTPException) throw e;
      continue;
    }
    if (!token) continue;

    // A Kortix-shaped token resolves, or it hard-rejects below. Never allow an
    // invalid Kortix token to fall through to free passthrough.
    const accountId = await resolveKortixAccount(token).catch(() => null);
    if (!accountId) throw new HTTPException(401, { message: source.invalid });

    return source.passthrough
      ? { isKortixUser: true, accountId, isPassthrough: true }
      : { isKortixUser: true, accountId };
  }

  // Mode 3: no Kortix token anywhere — pure passthrough, no billing.
  return { isKortixUser: false };
}

export function buildForwardHeaders(c: any): Headers {
  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower !== 'host' && lower !== 'traceparent' && lower !== 'x-request-id') {
      headers.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(getTraceHeaders())) {
    headers.set(key, value);
  }
  return headers;
}

export async function getRequestBody(
  c: any,
  method: string,
): Promise<ArrayBuffer | string | undefined> {
  if (method === 'GET' || method === 'HEAD') return undefined;
  return await c.req.raw.clone().arrayBuffer();
}

