// `kortix connectors calls`: the workspace's tool call log, newest first,
// through `@kortix/sdk` `listToolCalls` (GET /v1/workspaces/:id/tool-calls).
import { type ToolCallLogEntry, type ToolCallStatus, listToolCalls } from '@kortix/sdk';
import { withKortixScope } from '../api/sdk.ts';
import { emitJson, resolveProjectContext, surfaceApiError, takeFlagBool, takeFlagValue } from '../command-helpers.ts';
import { C, help, pad, status } from '../style.ts';

export const CALLS_HELP = help`Usage: kortix connectors calls [options]

The tool calls of the workspace, newest first: when, who (agent or person),
which action, the outcome, where it stopped, the refusal reason, the surface,
and the time Kortix and the upstream took. Never the arguments or the result.
A manager sees every call; a member sees their own calls and the calls of the
sessions they can open.

Options:
  --agent <slug>        Only calls an agent made as itself.
  --connector <slug>    Only calls of one connector.
  --surface <s>         session|mcp|execute|cli|api|app|held_run.
  --status <s>          ok|error|denied|pending_approval|expired|approved.
  --reason <code>       Only calls refused or failed for this reason.
  --session <id>        Only calls of one session.
  --limit <n>           Rows to print, 1-200 (default 50).
  --cursor <c>          Continue after the page that printed it.
  --json                Print the API page ({tool_calls, next_cursor}).
  --workspace <id>      Operate on this workspace id (default: linked).
  --host <name>         Operate against a non-default Kortix host.
`;

const STATUSES: readonly ToolCallStatus[] = ['ok', 'error', 'denied', 'pending_approval', 'expired', 'approved'];

/** One table row: the outcome word a person reads. */
function outcomeOf(row: ToolCallLogEntry): string {
  if (row.status === 'ok') return 'ok';
  if (row.status === 'denied') return 'refused';
  if (row.status === 'error') return 'failed';
  if (row.status === 'pending_approval') return 'waiting';
  return row.status;
}

const ms = (value: number | null) => (value === null ? '—' : `${value}`);

export function callsTable(rows: ToolCallLogEntry[], nextCursor: string | null): string {
  if (rows.length === 0) return `  ${C.dim}No tool calls match.${C.reset}\n`;
  const head = ['TIME', 'BY', 'ACTION', 'OUTCOME', 'STOPPED AT', 'REASON', 'SURFACE', 'KORTIX MS', 'UPSTREAM MS'];
  const cells = rows.map((r) => [
    r.created_at.replace('T', ' ').slice(0, 19),
    r.agent_slug ?? r.acting_user_email ?? r.acting_user_id ?? '—',
    r.action_path,
    outcomeOf(r),
    r.phase ?? '—',
    r.refusal_reason ?? '—',
    r.surface ?? '—',
    ms(r.kortix_ms),
    ms(r.upstream_ms),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i]!.length)));
  const line = (c: string[]) => `  ${c.map((v, i) => pad(v, widths[i]!)).join('   ').trimEnd()}\n`;
  const more = nextCursor
    ? `\n  ${C.dim}More: ${C.reset}${C.cyan}kortix connectors calls --cursor ${nextCursor}${C.reset}\n`
    : '';
  return `\n  ${C.dim}${line(head).trim()}${C.reset}\n${cells.map(line).join('')}${more}\n`;
}

export async function runConnectorCalls(argv: string[]): Promise<number> {
  const rest = [...argv];
  if (rest.includes('-h') || rest.includes('--help')) {
    process.stdout.write(CALLS_HELP);
    return 0;
  }
  let json: boolean;
  const f: Record<string, string | undefined> = {};
  try {
    json = takeFlagBool(rest, ['--json']);
    f.project = takeFlagValue(rest, ['--project', '--workspace']);
    f.host = takeFlagValue(rest, ['--host']);
    f.agent = takeFlagValue(rest, ['--agent']);
    f.connector = takeFlagValue(rest, ['--connector']);
    f.surface = takeFlagValue(rest, ['--surface']);
    f.status = takeFlagValue(rest, ['--status']);
    f.reason = takeFlagValue(rest, ['--reason']);
    f.session = takeFlagValue(rest, ['--session']);
    f.limit = takeFlagValue(rest, ['--limit']);
    f.cursor = takeFlagValue(rest, ['--cursor']);
  } catch (err) {
    process.stderr.write(`${status.err((err as Error).message)}\n`);
    return 2;
  }
  if (rest.length > 0) {
    process.stderr.write(`${status.err(`Unknown argument: ${rest[0]}. See kortix connectors calls --help.`)}\n`);
    return 2;
  }
  if (f.status && !(STATUSES as readonly string[]).includes(f.status)) {
    process.stderr.write(`${status.err(`--status must be one of ${STATUSES.join(', ')}.`)}\n`);
    return 2;
  }
  const limit = f.limit === undefined ? undefined : Number(f.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
    process.stderr.write(`${status.err('--limit must be an integer from 1 to 200.')}\n`);
    return 2;
  }
  const ctx = await resolveProjectContext({ projectArg: f.project, hostArg: f.host });
  if (!ctx) return 1;
  try {
    const page = await withKortixScope(ctx.auth, () =>
      listToolCalls(ctx.projectId, {
        agent: f.agent,
        connector: f.connector,
        surface: f.surface,
        status: f.status as ToolCallStatus | undefined,
        refusalReason: f.reason,
        sessionId: f.session,
        limit,
        cursor: f.cursor,
      }),
    );
    if (json) {
      emitJson(page);
      return 0;
    }
    process.stdout.write(callsTable(page.tool_calls, page.next_cursor));
    return 0;
  } catch (err) {
    return surfaceApiError(err);
  }
}
