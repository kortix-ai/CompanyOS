/**
 * The tool call log: one vocabulary for every surface that calls a tool —
 * an agent in a session, an outside MCP client, an `execute` program, the
 * CLI, an App. `connector_calls` stores these values; the web view, the CLI
 * and the MCP `tools.kortix.*` operations read them.
 */
import { z } from 'zod';

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

/** The `x-kortix-surface` request header a Kortix client sends; labels only, never authority. */
export const CALL_SURFACE_HEADER = 'x-kortix-surface';

export function isCallSurface(value: unknown): value is CallSurface {
  return typeof value === 'string' && (CALL_SURFACES as readonly string[]).includes(value);
}

export function isApprovalDelivery(value: unknown): value is ApprovalDelivery {
  return typeof value === 'string' && (APPROVAL_DELIVERIES as readonly string[]).includes(value);
}

/**
 * One row of the tool call log (`GET /v1/workspaces/{id}/tool-calls`). It
 * names the call, who made it, where it stopped and how long it took. It
 * never carries the call's arguments or result.
 */
export const ToolCallLogEntrySchema = z.object({
  execution_id: z.string(),
  /** `<connector>.<action>`. */
  action_path: z.string(),
  /** The connector slug, the part of `action_path` before the first dot. */
  connector: z.string(),
  status: z.enum(['ok', 'error', 'denied', 'pending_approval', 'expired', 'approved']),
  risk: z.enum(['read', 'write', 'destructive']).nullable(),
  session_id: z.string().nullable(),
  /** The person the call ran for. */
  acting_user_id: z.string().nullable(),
  acting_user_email: z.string().nullable(),
  principal_kind: z.string().nullable(),
  /** The agent the call ran as (kortix.yaml slug). */
  agent_slug: z.string().nullable(),
  /** The presented credential's id: a token or service account id, never a secret. */
  credential_id: z.string().nullable(),
  surface: z.string().nullable(),
  approval_delivery: z.string().nullable(),
  refusal_reason: z.string().nullable(),
  phase: z.string().nullable(),
  request_id: z.string().nullable(),
  trace_id: z.string().nullable(),
  /** Time Kortix spent on the call, upstream time excluded. */
  kortix_ms: z.number().int().nullable(),
  /** Time the upstream took; null when no upstream ran. */
  upstream_ms: z.number().int().nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});
export type ToolCallLogEntry = z.infer<typeof ToolCallLogEntrySchema>;

export const ToolCallLogPageSchema = z.object({
  tool_calls: z.array(ToolCallLogEntrySchema),
  /** Pass as `cursor` for the next page; null on the last page. Also sent as `X-Next-Cursor`. */
  next_cursor: z.string().nullable(),
});
export type ToolCallLogPage = z.infer<typeof ToolCallLogPageSchema>;
