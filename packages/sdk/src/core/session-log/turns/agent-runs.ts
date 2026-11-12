/**
 * Agent runs: the reports a person's agents send back, read as one unit (KRTX-4732).
 *
 * The agent hands work to colleagues, and each colleague's report arrives as its own turn (a
 * sub-agent's notice, a teammate's message, a batch of those). Drawn one by one, the internal
 * exchange buries the answer. A **run** is a sequence of those report turns with no person's
 * prompt between them. Its last turn is the **anchor**: it carries the answer. The other turns of
 * the run are **absorbed**: a host draws no row for them, and folds their reports and work into
 * the anchor's "Worked for 5m · 3 agents" row. Only the anchor's answer stays at the top level.
 *
 * Rules (`agent-runs.test.ts`):
 * - A person's prompt ends the run. So does a report turn that needs the person (it asks a
 *   question, hands over a deliverable, or renders a card); that turn stays out of every run.
 * - Live: the anchor is working, or it has no answer yet while an agent of this stretch (started
 *   since the last person's prompt) has not reported. Only the transcript's last run can be live.
 * - Stopped: the anchor ended aborted or on an error.
 * - A launch turn (one that started agents) is settled once every agent it started has reported
 *   and the turns holding those reports have settled: a host folds its agent rows then.
 * - The run's time runs from the end of the turn before it (the launch) to the end of the anchor.
 *
 * Framework-free: web and mobile draw the same runs.
 */
import { getChildSessionId } from '../../turns/parts';
import { parsePeerMessagePrompt } from '../../turns/peer-message-prompt';
import { textRendersCard } from '../../turns/segments/card-text';
import { isNoGroupActivityTool, isQuestionTool } from '../../turns/segments/session-activity-groups';
import { formatDuration } from '../../turns/state';
import { parseNoticeBatch, parseSubagentNotice } from '../../turns/subagent-notice';
import type { SessionLogMessage, ToolCallBlock } from '../types';
import type { SessionLogTurn } from './turn';

export interface SessionLogAgentRun {
  /** The turn that answers the run (the last one): the host draws the run's row on it. */
  anchor: string;
  /** Every turn of the run, in order, the anchor last. */
  turns: string[];
  /** Distinct agents that reported in this run. */
  agents: number;
  /** Agents started since the last person's prompt (0 when none is in sight). */
  started: number;
  /** Of those, the agents that have reported so far. */
  reported: number;
  /** The run's time: the end of the turn before it to the end of the anchor. Null while live or unknown. */
  durationMs: number | null;
  live: boolean;
  stopped: boolean;
}

export interface SessionLogAgentRuns {
  /** Every run, keyed by its anchor turn id. */
  runs: ReadonlyMap<string, SessionLogAgentRun>;
  /** The turns a host draws no row for: they fold into their anchor. */
  absorbed: ReadonlySet<string>;
  /** Each absorbed turn's anchor. */
  anchorOf: ReadonlyMap<string, string>;
  /** The turns that started agents, every one of which has reported in a settled turn: a host folds their agent rows. */
  settledLaunches: ReadonlySet<string>;
}

/** The prompt texts of a message: its text blocks and the text a `harness` block carries. */
function promptTexts(message: SessionLogMessage): string[] {
  return message.blocks.flatMap((b): string[] => {
    if (b.type === 'text') return [b.text];
    if (b.type !== 'harness' || b.kind !== 'text') return [];
    const data = b.data as { text?: unknown } | null;
    return typeof data?.text === 'string' ? [data.text] : [];
  });
}

/** A reporter: the child session a notice names, else the peer's short session id and handle. */
type Reporter = { sessionId: string } | { shortId: string; handle: string };

function reportersOf(message: SessionLogMessage): Reporter[] | null {
  for (const text of promptTexts(message)) {
    const peer = parsePeerMessagePrompt(text);
    if (peer) return [{ shortId: peer.fromShortId, handle: peer.from }];
    const batch = parseNoticeBatch(text);
    if (batch && batch.length > 1) {
      return batch.map((item) =>
        item.kind === 'peer_idle' ? { shortId: item.info.fromShortId, handle: item.info.from } : { sessionId: item.notice.sessionId },
      );
    }
    const notice = parseSubagentNotice(text);
    if (notice) return [{ sessionId: notice.sessionId }];
  }
  return null;
}

/** The prompt is another agent's notice (a sub-agent or teammate that finished, a peer message, a batch), not a person's message. */
export function isSessionLogAgentNotice(message: SessionLogMessage): boolean {
  return reportersOf(message) !== null;
}

const childIds = (turn: SessionLogTurn): string[] =>
  turn.blocks.flatMap((b) => {
    if (b.type !== 'tool_call') return [];
    const id = getChildSessionId(b);
    return id ? [id] : [];
  });

/** The turn asks the person something, hands over a deliverable, or renders a card before its answer. */
function needsPerson(turn: SessionLogTurn): boolean {
  return turn.blocks.some((b) => {
    if (b.type === 'tool_call') return isQuestionTool(b.name) || isNoGroupActivityTool((b as ToolCallBlock).name);
    return b.type === 'text' && b !== turn.response && textRendersCard(b.text);
  });
}

const ended = (turn: SessionLogTurn): string | null => turn.assistant.at(-1)?.completed_at ?? null;
const ms = (iso: string | null): number | null => {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(value) ? value : null;
};

interface OpenRun {
  turns: SessionLogTurn[];
  reporters: Set<string>;
  startedAt: string | null;
}

/** The runs of a transcript. See the module comment for the rules. */
export function sessionLogAgentRuns(turns: readonly SessionLogTurn[]): SessionLogAgentRuns {
  const runs = new Map<string, SessionLogAgentRun>();
  const absorbed = new Set<string>();
  const anchorOf = new Map<string, string>();
  /** Every child id ever started, so a peer's short id resolves to its session. */
  const launched: string[] = [];
  /** Child id → the index of the turn that carried its report. */
  const reportedAt = new Map<string, number>();
  const launches: Array<{ id: string; children: string[] }> = [];
  let stretchStarted = new Set<string>();
  let stretchReported = new Set<string>();
  let previousEnd: string | null = null;
  let open: OpenRun | null = null;

  const close = (tail: boolean) => {
    if (!open) return;
    const anchor = open.turns.at(-1)!;
    const stopped = anchor.status === 'aborted' || anchor.status === 'error';
    const waiting = [...stretchStarted].some((id) => !stretchReported.has(id));
    const live = tail && !stopped && (anchor.live || (!anchor.response && waiting));
    const start = ms(open.startedAt);
    const end = ms(ended(anchor));
    runs.set(anchor.id, {
      anchor: anchor.id,
      turns: open.turns.map((t) => t.id),
      agents: open.reporters.size,
      started: stretchStarted.size,
      reported: stretchReported.size,
      durationMs: live || start === null || end === null ? null : Math.max(0, end - start),
      live,
      stopped,
    });
    for (const turn of open.turns.slice(0, -1)) {
      absorbed.add(turn.id);
      anchorOf.set(turn.id, anchor.id);
    }
    open = null;
  };

  turns.forEach((turn, index) => {
    // A notice arrives as synthetic text, so its turn is `internal`: read the prompt, not the flag.
    const reporters = turn.compaction ? null : reportersOf(turn.user);
    const children = childIds(turn);
    if (!reporters) {
      close(false);
      stretchStarted = new Set(children);
      stretchReported = new Set();
      if (children.length) launches.push({ id: turn.id, children });
      launched.push(...children);
      previousEnd = ended(turn);
      return;
    }
    for (const id of children) stretchStarted.add(id);
    launched.push(...children);
    const keys = reporters.map((r) => {
      const id = 'sessionId' in r ? r.sessionId : launched.find((c) => c.startsWith(r.shortId));
      if (!id) return `peer:${'handle' in r ? r.handle : ''}`;
      reportedAt.set(id, index);
      if (stretchStarted.has(id)) stretchReported.add(id);
      return id;
    });
    if (needsPerson(turn)) {
      close(false);
      previousEnd = ended(turn);
      return;
    }
    open ??= { turns: [], reporters: new Set(), startedAt: previousEnd ?? turn.user.created_at };
    open.turns.push(turn);
    for (const key of keys) open.reporters.add(key);
  });
  close(true);

  const settledLaunches = new Set<string>();
  for (const launch of launches) {
    const at = launch.children.map((id) => reportedAt.get(id));
    if (at.some((i) => i === undefined)) continue;
    const last = turns[Math.max(...(at as number[]))]!;
    const run = runs.get(anchorOf.get(last.id) ?? last.id);
    if (!last.live && !run?.live) settledLaunches.add(launch.id);
  }

  return { runs, absorbed, anchorOf, settledLaunches };
}

/** The run's row: `Worked for 5m · 3 agents`, `Working · 2 of 3 agents reported`, or `Stopped · 2 of 3 agents reported`. */
export function sessionLogAgentRunLabel(run: Pick<SessionLogAgentRun, 'agents' | 'started' | 'reported' | 'durationMs' | 'live' | 'stopped'>): string {
  const agents = (n: number) => `${n} agent${n === 1 ? '' : 's'}`;
  if (run.live || run.stopped) {
    const progress = run.started >= run.reported && run.started > 0 ? `${run.reported} of ${agents(run.started)}` : agents(run.agents);
    return `${run.live ? 'Working' : 'Stopped'} · ${progress} reported`;
  }
  const duration = run.durationMs == null ? '' : formatDuration(run.durationMs);
  return `${duration ? `Worked for ${duration}` : 'Worked'} · ${agents(run.agents)}`;
}
