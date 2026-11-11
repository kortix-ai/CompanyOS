// The tool call log of a workspace: every connector call, from every surface,
// newest first (`GET /v1/workspaces/:id/tool-calls`). A row names the call,
// who made it, where it stopped and how long it took; it never carries the
// call's arguments or result. The fields match
// `@kortix/api-contract/tool-calls` (`ToolCallLogEntrySchema`).
//
// A manager sees every call except those of private channel threads they are
// not in; a member sees the calls they made and the calls of sessions they
// can open; an agent token sees its own session only.

import { backendApi } from '../../http/api-client';
import { unwrap } from './shared';

export type ToolCallStatus = 'ok' | 'error' | 'denied' | 'pending_approval' | 'expired' | 'approved';

export interface ToolCallLogEntry {
  execution_id: string;
  /** `<connector>.<action>`. */
  action_path: string;
  /** The connector slug: the part of `action_path` before the first dot. */
  connector: string;
  status: ToolCallStatus;
  risk: 'read' | 'write' | 'destructive' | null;
  session_id: string | null;
  /** The person the call ran for. */
  acting_user_id: string | null;
  acting_user_email: string | null;
  /** `user` | `agent` | `service_account` | `app`. */
  principal_kind: string | null;
  /** The agent the call ran as (its kortix.yaml slug). */
  agent_slug: string | null;
  /** The presented credential's id (a token or service account id), never a secret. */
  credential_id: string | null;
  /** `session` | `mcp` | `execute` | `cli` | `api` | `app` | `held_run`. */
  surface: string | null;
  /** `model` | `native` | `browser`. */
  approval_delivery: string | null;
  /** The machine reason a call was refused or failed (`policy_block`, `upstream_404`). */
  refusal_reason: string | null;
  /** The step the call stopped at: `grant` | `policy` | `account` | `credential` | `approval` | `upstream` | `done`. */
  phase: string | null;
  request_id: string | null;
  trace_id: string | null;
  /** Time Kortix spent on the call, upstream time excluded. */
  kortix_ms: number | null;
  /** Time the upstream took; null when no upstream ran. */
  upstream_ms: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ToolCallLogPage {
  tool_calls: ToolCallLogEntry[];
  /** Pass as `cursor` for the next page; null on the last page. */
  next_cursor: string | null;
}

export interface ListToolCallsOptions {
  /** The agent slug the call ran as. */
  agent?: string;
  /** A connector slug. */
  connector?: string;
  surface?: string;
  status?: ToolCallStatus;
  refusalReason?: string;
  sessionId?: string;
  /** ISO 8601; inclusive. */
  since?: string;
  /** ISO 8601; exclusive. */
  until?: string;
  /** 1–200; the API default is 50. */
  limit?: number;
  /** `next_cursor` of the previous page. */
  cursor?: string;
}

/** One page of a workspace's tool call log. */
export async function listToolCalls(workspaceId: string, options: ListToolCallsOptions = {}) {
  const query = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  };
  set('agent', options.agent);
  set('connector', options.connector);
  set('surface', options.surface);
  set('status', options.status);
  set('refusal_reason', options.refusalReason);
  set('session_id', options.sessionId);
  set('since', options.since);
  set('until', options.until);
  set('limit', options.limit);
  set('cursor', options.cursor);
  const qs = query.toString();
  return unwrap(
    await backendApi.get<ToolCallLogPage>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tool-calls${qs ? `?${qs}` : ''}`,
    ),
  );
}
