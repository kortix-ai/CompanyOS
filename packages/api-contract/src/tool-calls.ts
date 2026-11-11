/**
 * The tool call log: one vocabulary for every surface that calls a tool —
 * an agent in a session, an outside MCP client, an `execute` program, the
 * CLI, an App. `connector_calls` stores these values; the web view, the CLI
 * and the MCP `tools.kortix.*` operations read them.
 */

/** Where a call came from. */
export const CALL_SURFACES = ['session', 'mcp', 'execute', 'cli', 'api', 'app', 'held_run'] as const;
export type CallSurface = (typeof CALL_SURFACES)[number];

/** Who the call ran as. Every agent-made call runs as an agent principal. */
export const CALL_PRINCIPAL_KINDS = ['user', 'agent', 'service_account', 'app'] as const;
export type CallPrincipalKind = (typeof CALL_PRINCIPAL_KINDS)[number];

/**
 * How a gated call's approval reaches a person.
 *
 * - `model`   — the calling agent relays the question and the person answers it
 *               on a Kortix surface (Inbox, chat card). The agent never decides.
 * - `native`  — the MCP client's own confirmation (elicitation) is the approval.
 * - `browser` — only a signed-in browser session decides; no token does.
 */
export const APPROVAL_DELIVERIES = ['model', 'native', 'browser'] as const;
export type ApprovalDelivery = (typeof APPROVAL_DELIVERIES)[number];

/** The step a call stopped at. `done` = it reached the upstream and returned. */
export const CALL_PHASES = ['grant', 'policy', 'account', 'credential', 'approval', 'upstream', 'done'] as const;
export type CallPhase = (typeof CALL_PHASES)[number];

/** How a client asks that its gated calls be decided: `browser` only narrows who may decide. */
export const APPROVAL_DELIVERY_HEADER = 'x-kortix-approval-delivery';

/** The `x-kortix-surface` request header a Kortix client sends; labels only, never authority. */
export const CALL_SURFACE_HEADER = 'x-kortix-surface';

export function isCallSurface(value: unknown): value is CallSurface {
  return typeof value === 'string' && (CALL_SURFACES as readonly string[]).includes(value);
}

export function isApprovalDelivery(value: unknown): value is ApprovalDelivery {
  return typeof value === 'string' && (APPROVAL_DELIVERIES as readonly string[]).includes(value);
}
