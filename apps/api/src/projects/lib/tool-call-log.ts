/**
 * The tool call log of a workspace: every connector call, from every surface,
 * newest first (`GET /v1/workspaces/:id/tool-calls`).
 *
 * Who sees which row:
 *  - a session-bound credential (an agent's own token) sees only the calls
 *    of its own session;
 *  - a manager (`project.members.manage`) sees every call, except the calls
 *    of a private channel's threads they are not in (as the approval inbox);
 *  - any other member sees the calls they made and the calls of the
 *    sessions they can open (`loadVisibleSessionsForList`).
 *
 * A row never carries the call's arguments or result: no `result_summary`,
 * no `request_digest`.
 */
import { and, desc, eq, gte, isNotNull, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { connectorCalls } from '@kortix/db';
import type { ToolCallLogEntry } from '@kortix/api-contract/tool-calls';
import { db } from '../../shared/db';
import type { Actor } from '../../iam/actor';
import type { ProjectRow } from './serializers';
import { callerHasManagerStanding, loadVisibleSessionsForList } from './session-visibility';
import { lookupEmailsByUserIds } from './user-identity';
import { hiddenSpaceIds, sessionsInSpaces } from '../../shared/space-access';

export const TOOL_CALL_PAGE_DEFAULT = 50;
export const TOOL_CALL_PAGE_MAX = 200;
/** A member's page is filtered after the read: at most this many reads fill it. */
const MEMBER_SCAN_ROUNDS = 5;

export const TOOL_CALL_STATUSES = ['ok', 'error', 'denied', 'pending_approval', 'expired', 'approved'] as const;
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

export interface ToolCallFilter {
  agent?: string | null;
  /** A connector slug: matches `action_path` `<slug>.*`. */
  connector?: string | null;
  surface?: string | null;
  status?: ToolCallStatus | null;
  refusalReason?: string | null;
  sessionId?: string | null;
  since?: Date | null;
  until?: Date | null;
}

export interface ListToolCallsInput {
  loaded: { row: ProjectRow; userId: string; actor?: Actor | null };
  /** The caller's agent/sandbox token binding (`callerKortixSessionId`). */
  boundSessionId: string | null;
  filter: ToolCallFilter;
  limit: number;
  cursor: string | null;
}

export interface ToolCallPage {
  rows: ToolCallLogEntry[];
  nextCursor: string | null;
}

interface Position {
  /** `created_at` at microsecond precision, as Postgres prints it in UTC. */
  createdAt: string;
  executionId: string;
}

/**
 * The cursor names the last row of the page the caller already read, so it
 * carries nothing the caller has not seen. Unsealed on purpose.
 */
export function encodeToolCallCursor(position: Position): string {
  return Buffer.from(`${position.createdAt}|${position.executionId}`, 'utf8').toString('base64url');
}

const CURSOR_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null for a cursor this module did not write. */
export function decodeToolCallCursor(raw: string): Position | null {
  let text: string;
  try {
    text = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const [createdAt, executionId, extra] = text.split('|');
  if (extra !== undefined || !createdAt || !executionId) return null;
  if (!CURSOR_TS.test(createdAt) || !UUID.test(executionId)) return null;
  return { createdAt, executionId };
}

/** `LIKE` treats `%`, `_` and `\` as syntax; a slug matches literally. */
function likePrefix(value: string): string {
  return `${value.replace(/[\\%_]/g, (c) => `\\${c}`)}.%`;
}

function filterWhere(projectId: string, filter: ToolCallFilter): SQL[] {
  const where: SQL[] = [eq(connectorCalls.projectId, projectId)];
  if (filter.agent) where.push(eq(connectorCalls.agentSlug, filter.agent));
  if (filter.connector) where.push(like(connectorCalls.actionPath, likePrefix(filter.connector)));
  if (filter.surface) where.push(eq(connectorCalls.surface, filter.surface));
  if (filter.status) where.push(eq(connectorCalls.status, filter.status));
  if (filter.refusalReason) where.push(eq(connectorCalls.refusalReason, filter.refusalReason));
  if (filter.sessionId) where.push(eq(connectorCalls.sessionId, filter.sessionId));
  if (filter.since) where.push(gte(connectorCalls.createdAt, filter.since));
  if (filter.until) where.push(lt(connectorCalls.createdAt, filter.until));
  return where;
}

const createdAtText = sql<string>`to_char(${connectorCalls.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const ROW_COLUMNS = {
  executionId: connectorCalls.executionId,
  actionPath: connectorCalls.actionPath,
  status: connectorCalls.status,
  risk: connectorCalls.risk,
  sessionId: connectorCalls.sessionId,
  actingUserId: connectorCalls.actingUserId,
  createdAt: connectorCalls.createdAt,
  createdAtText,
  resolvedAt: connectorCalls.resolvedAt,
  credentialId: connectorCalls.credentialId,
  principalKind: connectorCalls.principalKind,
  agentSlug: connectorCalls.agentSlug,
  surface: connectorCalls.surface,
  approvalDelivery: connectorCalls.approvalDelivery,
  refusalReason: connectorCalls.refusalReason,
  phase: connectorCalls.phase,
  requestId: connectorCalls.requestId,
  traceId: connectorCalls.traceId,
  kortixMs: connectorCalls.kortixMs,
  upstreamMs: connectorCalls.upstreamMs,
};

type ScannedRow = Awaited<ReturnType<typeof readBatch>>[number];

async function readBatch(where: SQL[], after: Position | null, size: number) {
  const keyset = after
    ? sql`(${connectorCalls.createdAt}, ${connectorCalls.executionId}) < (${after.createdAt}::timestamptz, ${after.executionId}::uuid)`
    : undefined;
  return db
    .select(ROW_COLUMNS)
    .from(connectorCalls)
    .where(and(...where, ...(keyset ? [keyset] : [])))
    .orderBy(desc(connectorCalls.createdAt), desc(connectorCalls.executionId))
    .limit(size);
}

const positionOf = (row: ScannedRow): Position => ({ createdAt: row.createdAtText, executionId: row.executionId });

/** The connector slug of `<slug>.<action>`. */
function connectorOf(actionPath: string): string {
  const dot = actionPath.indexOf('.');
  return dot > 0 ? actionPath.slice(0, dot) : actionPath;
}

/** Which rows of one batch this caller may see. */
type RowGate = (rows: ScannedRow[]) => Promise<ScannedRow[]>;

async function gateFor(input: ListToolCallsInput): Promise<{ where: SQL[]; gate: RowGate }> {
  const { loaded, boundSessionId } = input;
  const projectId = loaded.row.projectId;
  const where = filterWhere(projectId, input.filter);

  // An agent's own token reads its own session's calls, nothing else.
  if (boundSessionId !== null) {
    where.push(eq(connectorCalls.sessionId, boundSessionId));
    return { where, gate: async (rows) => rows };
  }

  const hidden = await hiddenSpaceIds(projectId, loaded.userId, null);
  if (await callerHasManagerStanding(loaded, null)) {
    return {
      where,
      gate: async (rows) => {
        const inHidden = await sessionsInSpaces(
          projectId,
          rows.flatMap((r) => (r.sessionId && r.actingUserId !== loaded.userId ? [r.sessionId] : [])),
          hidden,
        );
        return rows.filter((r) => !r.sessionId || r.actingUserId === loaded.userId || !inHidden.has(r.sessionId));
      },
    };
  }

  // A member: their own calls, and the calls of sessions they can open. A
  // call outside any session that someone else made is never theirs to see.
  where.push(or(eq(connectorCalls.actingUserId, loaded.userId), isNotNull(connectorCalls.sessionId))!);
  return {
    where,
    gate: async (rows) => {
      const others = rows.flatMap((r) => (r.actingUserId !== loaded.userId && r.sessionId ? [r.sessionId] : []));
      const visible = others.length ? await loadVisibleSessionsForList(loaded, others, null, null) : new Map();
      return rows.filter((r) => r.actingUserId === loaded.userId || (r.sessionId !== null && visible.has(r.sessionId)));
    },
  };
}

/** One page of the tool call log for this caller. */
export async function listToolCalls(input: ListToolCallsInput): Promise<ToolCallPage> {
  const limit = Math.min(Math.max(1, input.limit), TOOL_CALL_PAGE_MAX);
  const { where, gate } = await gateFor(input);
  const batchSize = Math.min(TOOL_CALL_PAGE_MAX, limit * 2);

  const kept: ScannedRow[] = [];
  let after = input.cursor ? decodeToolCallCursor(input.cursor) : null;
  let nextCursor: string | null = null;
  for (let round = 0; round < MEMBER_SCAN_ROUNDS; round += 1) {
    const batch = await readBatch(where, after, batchSize);
    const exhausted = batch.length < batchSize;
    const allowed = await gate(batch);
    // Keep rows in order until the page is full; the cursor is the last row
    // KEPT, so a row past it is read again on the next page.
    let lastKept: ScannedRow | null = null;
    for (const row of allowed) {
      if (kept.length === limit) break;
      kept.push(row);
      lastKept = row;
    }
    if (kept.length === limit) {
      // More rows exist past the page when the read did not run out, or when
      // a visible row of this read did not fit.
      const moreAfterPage = !exhausted || (lastKept !== null && allowed.indexOf(lastKept) < allowed.length - 1);
      nextCursor = moreAfterPage && lastKept ? encodeToolCallCursor(positionOf(lastKept)) : null;
      break;
    }
    if (exhausted) break;
    after = positionOf(batch[batch.length - 1]!);
    // Out of rounds with a partial page: hand back where the scan stopped.
    if (round === MEMBER_SCAN_ROUNDS - 1) nextCursor = encodeToolCallCursor(after);
  }

  const userIds = [...new Set(kept.flatMap((r) => (r.actingUserId ? [r.actingUserId] : [])))];
  const emails = userIds.length ? await lookupEmailsByUserIds(userIds) : new Map<string, string | null>();
  return {
    rows: kept.map((r) => ({
      execution_id: r.executionId,
      action_path: r.actionPath,
      connector: connectorOf(r.actionPath),
      status: r.status,
      risk: r.risk ?? null,
      session_id: r.sessionId ?? null,
      acting_user_id: r.actingUserId ?? null,
      acting_user_email: r.actingUserId ? (emails.get(r.actingUserId) ?? null) : null,
      principal_kind: r.principalKind ?? null,
      agent_slug: r.agentSlug ?? null,
      credential_id: r.credentialId ?? null,
      surface: r.surface ?? null,
      approval_delivery: r.approvalDelivery ?? null,
      refusal_reason: r.refusalReason ?? null,
      phase: r.phase ?? null,
      request_id: r.requestId ?? null,
      trace_id: r.traceId ?? null,
      kortix_ms: r.kortixMs ?? null,
      upstream_ms: r.upstreamMs ?? null,
      created_at: r.createdAt.toISOString(),
      resolved_at: r.resolvedAt?.toISOString() ?? null,
    })),
    nextCursor,
  };
}
