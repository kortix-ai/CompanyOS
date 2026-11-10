import { describe, expect, test } from 'bun:test';

import { mcpSetupLinkDraft } from './setup-link-params';

/**
 * KRTX-4640: an agent cannot add a custom MCP server itself — the API refuses
 * with `custom_connector_needs_human` and hands back `setup_url`, the page
 * where a person confirms the server. The page never read those params, so the
 * confirm flow landed on the bare catalogue and the only working install was
 * the Composio card. The link's draft must pre-fill the Add-MCP dialog.
 */
describe('mcpSetupLinkDraft', () => {
  test('reads the custom=1 mcp link an agent hands back', () => {
    const params = new URLSearchParams('tab=browse&custom=1&provider=mcp&url=https%3A%2F%2Fmcp.example.com%2Fmcp&transport=http');
    expect(mcpSetupLinkDraft(params)).toEqual({ url: 'https://mcp.example.com/mcp' });
  });

  test('keeps the agent-proposed display name', () => {
    const params = new URLSearchParams('custom=1&provider=mcp&url=https%3A%2F%2Fmcp.example.com%2Fmcp&name=Wispr%20Flow');
    expect(mcpSetupLinkDraft(params)).toEqual({ url: 'https://mcp.example.com/mcp', name: 'Wispr Flow' });
  });

  test('anything but the agent hand-off link is null, so a manual open stays empty', () => {
    expect(mcpSetupLinkDraft(null)).toBeNull();
    expect(mcpSetupLinkDraft(new URLSearchParams('custom=1&provider=mcp&url=https://mcp.example.com/mcp'.replace('custom=1', 'custom=0')))).toBeNull();
    // Another provider's custom form does not pre-fill (openapi/postman/graphql/http drafts).
    expect(mcpSetupLinkDraft(new URLSearchParams('custom=1&provider=openapi&spec=https://example.com/openapi.json'))).toBeNull();
    // No URL, or not an http(s) URL: nothing to pre-fill.
    expect(mcpSetupLinkDraft(new URLSearchParams('custom=1&provider=mcp'))).toBeNull();
    expect(mcpSetupLinkDraft(new URLSearchParams('custom=1&provider=mcp&url=not-a-url'))).toBeNull();
  });

  test('an sse transport stays null: the dialog installs http and must not silently change it', () => {
    expect(mcpSetupLinkDraft(new URLSearchParams('custom=1&provider=mcp&url=https://mcp.example.com/mcp&transport=sse'))).toBeNull();
  });
});
