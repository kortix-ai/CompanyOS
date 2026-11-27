/**
 * Kortix's own agent-identity MCP servers: the authenticator, the browser and
 * the phone an agent uses as its own. Served by this API in-process, like the
 * Google servers (../google/host.ts): `../egress.ts` hands every request for
 * {@link KORTIX_AGENT_MCP_ORIGIN} to `dispatchKortixAgentMcp`, and the name
 * does not resolve in DNS, so a request that bypassed the egress fails closed.
 *
 * They are ordinary `mcp` connectors: grants, tool rules, approvals, held
 * calls and the audit log apply as for any connector. Each account's
 * credential is its own encrypted state (./state.ts); the model never sees it.
 */

export const KORTIX_AGENT_MCP_ORIGIN = 'https://agent.mcp.kortix.com';

export const KORTIX_AGENT_SERVICES = ['authenticator', 'browser', 'phone'] as const;
export type KortixAgentService = (typeof KORTIX_AGENT_SERVICES)[number];

const SERVICE_SET: ReadonlySet<string> = new Set(KORTIX_AGENT_SERVICES);

/** The connector slug each service installs as. */
export const KORTIX_AGENT_SLUGS: Record<KortixAgentService, string> = {
  authenticator: 'kortix_agent_authenticator',
  browser: 'kortix_browser',
  phone: 'kortix_phone',
};

export function kortixAgentMcpUrl(service: KortixAgentService): string {
  return `${KORTIX_AGENT_MCP_ORIGIN}/${service}`;
}

/** The service a Kortix agent MCP URL names, or `null` for any other URL. */
export function kortixAgentServiceForUrl(url: string | URL): KortixAgentService | null {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  if (parsed.origin !== KORTIX_AGENT_MCP_ORIGIN || parsed.search || parsed.hash) return null;
  const service = parsed.pathname.replace(/^\/+|\/+$/g, '');
  return SERVICE_SET.has(service) ? (service as KortixAgentService) : null;
}
