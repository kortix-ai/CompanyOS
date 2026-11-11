/**
 * How a client adds the Kortix MCP server: the URL and the exact install text
 * for each client. One module, no React, so the "Connect MCP" dialog, the
 * Settings › MCP tab and the public setup prompt (`/setup-prompt.md` in
 * apps/web) print the same commands.
 */

import { stripTrailingSlashes } from '@kortix/sdk';

/** The server name every install uses. */
export const MCP_SERVER_NAME = 'kortix';

/** The MCP endpoint: `<api origin>/v1/mcp`. */
export function mcpUrl(backendUrl: string | undefined): string {
  const base = stripTrailingSlashes(backendUrl || 'https://api.kortix.com/v1');
  return `${base.endsWith('/v1') ? base : `${base}/v1`}/mcp`;
}

/** A Cursor install deep link that carries the URL as base64 JSON config. */
export function cursorInstallUrl(url: string): string {
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${MCP_SERVER_NAME}&config=${btoa(JSON.stringify({ url }))}`;
}

/** Claude Code: one command. The browser sign-in starts from `/mcp`. */
export function claudeCodeMcpCommand(url: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`;
}

/** Codex: add the server, then sign in. */
export function codexMcpCommand(url: string): string {
  return `codex mcp add ${MCP_SERVER_NAME} --url ${url}\ncodex mcp login ${MCP_SERVER_NAME}`;
}

/** The `mcpServers` JSON block that Cursor and most other MCP clients read. */
export function mcpJsonConfig(url: string): string {
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url } } }, null, 2);
}
