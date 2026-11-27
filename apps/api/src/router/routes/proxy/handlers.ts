import { HTTPException } from 'hono/http-exception';
import { type ProxyServiceConfig } from '../../config/proxy-services';
import { config } from '../../../config';
import { tryAuthenticate, buildForwardHeaders, getRequestBody, reserveToolProxyCredits } from './helpers';
import { assertSafeFirecrawlBody, callKortixProxy, forwardUpstream } from '../../services/billed-proxy';

// === Core Proxy Handler ===
//
// Three authentication/billing modes:
//
// 1. Kortix token (kortix_/kortix_sb_ in our DB) in Authorization header
//    → Inject Kortix's API key, forward, bill the route's tool price.
//
// 2. User's own API key in Authorization + Kortix token in X-Kortix-Token header
//    → Passthrough (no key injection), billed the tool price.
//
// 3. User's own API key, no Kortix token anywhere
//    → Pure passthrough. No billing, no gating (self-hosted / non-Kortix user).

async function assertSafeFirecrawlTarget(c: any, service: ProxyServiceConfig, method: string): Promise<void> {
  if (service.name !== 'firecrawl' || method.toUpperCase() !== 'POST') return;
  await assertSafeFirecrawlBody(service, method, await getRequestBody(c, method));
}

export async function handleProxy(c: any, service: ProxyServiceConfig, prefix: string) {
  const fullPath = new URL(c.req.url).pathname;
  const prefixStr = `/${prefix}`;
  // Find the prefix anywhere in the path (handles mount-point prefixing by Hono)
  const prefixIdx = fullPath.indexOf(prefixStr);
  const subPath = prefixIdx !== -1 ? fullPath.slice(prefixIdx + prefixStr.length) || '/' : '/';
  const queryString = new URL(c.req.url).search;
  const method = c.req.method;

  await assertSafeFirecrawlTarget(c, service, method);

  const auth = await tryAuthenticate(c);

  if (auth.isKortixUser && auth.accountId && !auth.isPassthrough) {
    // Mode 1: Kortix-owned key — inject our key, bill the tool price
    return handleKortixProxy(c, service, subPath, queryString, method, auth.accountId);
  } else if (auth.isPassthrough && auth.accountId) {
    // Mode 2: User's own key — passthrough, billed the tool price.
    return handleKortixPassthrough(c, service, subPath, queryString, method, auth.accountId);
  } else {
    // Mode 3: No Kortix token — pure passthrough, no billing.
    // When billing is enabled, reject: only kortix_ tokens with billing are accepted.
    if (config.KORTIX_BILLING_INTERNAL_ENABLED) {
      throw new HTTPException(401, {
        message: 'Kortix API key required. Get one at https://kortix.com',
      });
    }
    // Self-hosted: allow passthrough for BYOC users with their own API keys.
    return handlePassthrough(c, service, subPath, queryString, method);
  }
}

// === Kortix User: match allowed route, inject our key, bill with route-specific pricing ===

async function handleKortixProxy(
  c: any,
  service: ProxyServiceConfig,
  subPath: string,
  queryString: string,
  method: string,
  accountId: string,
) {
  const body = await getRequestBody(c, method);
  return callKortixProxy({ service, accountId, method, subPath, queryString, headers: buildForwardHeaders(c), body });
}

// === Kortix user with own key: passthrough, billed the tool price ===

async function handleKortixPassthrough(
  c: any,
  service: ProxyServiceConfig,
  subPath: string,
  queryString: string,
  method: string,
  accountId: string,
) {
  const targetUrl = `${service.targetBaseUrl}${subPath}${queryString}`;
  const headers = buildForwardHeaders(c);
  // Remove X-Kortix-Token from forwarded headers — upstream doesn't need it
  headers.delete('x-kortix-token');
  const body = await getRequestBody(c, method);

  const toolReservation = await reserveToolProxyCredits(
    accountId,
    service.billingToolName,
    `Passthrough ${service.name}: ${method} ${subPath}`,
  );

  console.log(`[PROXY] ${service.name} (passthrough:${accountId}) ${method} ${subPath} → ${targetUrl}`);

  return forwardUpstream(service, method, subPath, targetUrl, headers, body, toolReservation);
}

// === Not Kortix user: pure passthrough ===

async function handlePassthrough(
  c: any,
  service: ProxyServiceConfig,
  subPath: string,
  queryString: string,
  method: string,
) {
  const targetUrl = `${service.targetBaseUrl}${subPath}${queryString}`;
  const headers = buildForwardHeaders(c);
  const body = await getRequestBody(c, method);

  console.log(`[PROXY] ${service.name} (passthrough) ${method} ${subPath}`);

  return forwardUpstream(service, method, subPath, targetUrl, headers, body, null);
}
