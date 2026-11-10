/**
 * The MCP-server draft an agent's `setup_url` pre-fills: when an agent tries
 * to add a custom MCP server, the API refuses it (`custom_connector_needs_human`)
 * and hands back the page where a person confirms the server —
 * `…/connectors?custom=1&provider=mcp&url=…&name=…` (built by
 * `customConnectorSetupUrl` in apps/api/src/connectors/db-deps.ts). The page
 * must open the Add-MCP dialog with that draft, or the person's only working
 * install is whatever the catalogue sells — for many servers, Composio (KRTX-4640).
 */
export interface McpSetupLinkDraft {
  url: string;
  /** The draft's display name, when the agent proposed one. */
  name?: string;
}

/** The draft the link pre-fills, or null for any other link (a manual open stays empty). */
export function mcpSetupLinkDraft(params: URLSearchParams | null): McpSetupLinkDraft | null {
  if (!params || params.get('custom') !== '1' || params.get('provider') !== 'mcp') return null;
  const url = params.get('url')?.trim() ?? '';
  if (!/^https?:\/\//i.test(url)) return null;
  // The Add-MCP dialog installs `transport: 'http'`; an sse draft must not be
  // silently re-transported, so it keeps the old behaviour (no pre-fill).
  if (params.get('transport') === 'sse') return null;
  const name = params.get('name')?.trim();
  return { url, ...(name ? { name } : {}) };
}
