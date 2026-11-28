'use client';

import { sessionLogAgentRuns, type SessionLogAgentRun, type SessionLogAgentRuns, type SessionLogTurn } from '@kortix/sdk';
import { sessionTurnDurationMs } from './session-turn-meta-rows';
import { isAgentNoticeTurn } from './transcript';

/** A turn no person prompted: another agent's report, or the harness's own continuation. */
const isReportTurn = (turn: SessionLogTurn) => turn.internal || isAgentNoticeTurn(turn);
import { useMemo, useState } from 'react';

/** What one transcript row receives from its agent run (KRTX-4732). */
export interface AgentRunRowProps {
  agentRun?: SessionLogAgentRun;
  runTurns?: readonly SessionLogTurn[];
  foldStartedWork?: boolean;
}

export interface AgentRunLayout {
  /** The turns the transcript draws no row for: they fold into their run's host turn. */
  absorbed: ReadonlySet<string>;
  /** A row's run props; the same object while nothing about the run changed. */
  propsOf: (turnId: string) => AgentRunRowProps;
}

const NONE: AgentRunRowProps = Object.freeze({});
const EMPTY: AgentRunLayout = { absorbed: new Set(), propsOf: () => NONE };

const sameRun = (a: SessionLogAgentRun, b: SessionLogAgentRun) =>
  a.anchor === b.anchor &&
  a.agents === b.agents &&
  a.started === b.started &&
  a.reported === b.reported &&
  a.durationMs === b.durationMs &&
  a.live === b.live &&
  a.stopped === b.stopped &&
  a.turns.length === b.turns.length &&
  a.turns.every((id, i) => id === b.turns[i]);

const sameTurns = (a: readonly SessionLogTurn[] | undefined, b: readonly SessionLogTurn[] | undefined) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((turn, i) => turn === b[i]));

/**
 * Each run moves to the turn it follows: the person's prompt that started the work (KRTX-5238).
 * The SDK draws a run on its last turn, so every report that ended a run made a new "Worked for"
 * row further down, and the row the reader had opened went away with the old anchor. Here the
 * run's row stands on the turn before it, which never moves: every turn of the run (its last
 * one too) is absorbed there, and consecutive runs after one prompt merge into one row. A run
 * with no turn before it keeps its own anchor.
 */
export function hostAgentRuns(turns: readonly SessionLogTurn[], layout: SessionLogAgentRuns): SessionLogAgentRuns {
  if (layout.runs.size === 0) return layout;
  const index = new Map(turns.map((turn, i) => [turn.id, i] as const));
  const absorbed = new Set(layout.absorbed);
  const anchorOf = new Map(layout.anchorOf);
  const runs = new Map<string, SessionLogAgentRun>();
  const ordered = [...layout.runs.values()].sort((a, b) => (index.get(a.turns[0]!) ?? 0) - (index.get(b.turns[0]!) ?? 0));
  for (const run of ordered) {
    let at = (index.get(run.turns[0]!) ?? 0) - 1;
    // The host is a person's turn: another report turn (one the SDK kept out of a run) is not.
    while (at >= 0 && (absorbed.has(turns[at]!.id) || isReportTurn(turns[at]!))) at -= 1;
    const host = at >= 0 ? turns[at]! : null;
    if (!host) {
      runs.set(run.anchor, run);
      continue;
    }
    for (const id of run.turns) {
      absorbed.add(id);
      anchorOf.set(id, host.id);
    }
    const held = runs.get(host.id);
    const hostMs = held ? 0 : sessionTurnDurationMs(host);
    runs.set(host.id, {
      ...run,
      anchor: host.id,
      turns: [...(held?.turns ?? []), ...run.turns],
      agents: Math.max(held?.agents ?? 0, run.agents),
      durationMs: run.durationMs === null ? null : (held ? held.durationMs ?? 0 : hostMs ?? 0) + run.durationMs,
    });
  }
  // A report turn the SDK keeps out of every run (it asks the person, or renders a card) still
  // belongs to the work that started it: it joins the run of the turn it follows from the
  // start, so it never moves from its own row into the fold later. Its question docks on the
  // composer and its cards stay in view; only its steps fold.
  let host: SessionLogTurn | null = null;
  for (const turn of turns) {
    if (!isReportTurn(turn)) {
      host = runs.has(turn.id) ? turn : null;
      continue;
    }
    if (!host || absorbed.has(turn.id)) continue;
    const held = runs.get(host.id)!;
    absorbed.add(turn.id);
    anchorOf.set(turn.id, host.id);
    runs.set(host.id, { ...held, turns: [...held.turns, turn.id], live: held.live || turn.live });
  }
  for (const [id, run] of runs) {
    if (run.anchor !== id) continue;
    // A report turn kept out of the SDK's run still reported for an agent this work started.
    runs.set(id, { ...run, agents: Math.max(run.agents, run.started), turns: [...run.turns].sort((a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0)) });
  }
  return { ...layout, runs, absorbed, anchorOf };
}

/**
 * The agent runs of a transcript (`sessionLogAgentRuns`), as row props. A stream delta remakes
 * the turn list; a row whose run did not change keeps its props object, so its memoized row
 * still bails out. `disabled` (a messages-only thread): no runs.
 */
export function useAgentRunLayout(turns: readonly SessionLogTurn[], disabled: boolean): AgentRunLayout {
  // The props each row got last time. A cache, not state: writing it never renders.
  const [previous] = useState(() => new Map<string, AgentRunRowProps>());
  return useMemo(() => {
    if (disabled) return EMPTY;
    const layout = hostAgentRuns(turns, sessionLogAgentRuns(turns));
    if (layout.runs.size === 0 && layout.settledLaunches.size === 0) {
      previous.clear();
      return EMPTY;
    }
    const byId = new Map(turns.map((turn) => [turn.id, turn] as const));
    const next = new Map<string, AgentRunRowProps>();
    const ids = new Set([...layout.runs.keys(), ...layout.settledLaunches]);
    for (const id of ids) {
      const run = layout.runs.get(id);
      // A hosted run's turns are all reports; a run left on its own anchor draws the others.
      const members = run ? (run.anchor === run.turns.at(-1) ? run.turns.slice(0, -1) : run.turns) : [];
      const runTurns = run ? members.map((turnId) => byId.get(turnId)!) : undefined;
      const fresh: AgentRunRowProps = {
        ...(run ? { agentRun: run, runTurns } : {}),
        ...(layout.settledLaunches.has(id) ? { foldStartedWork: true } : {}),
      };
      const old = previous.get(id);
      const unchanged =
        old &&
        !!old.foldStartedWork === !!fresh.foldStartedWork &&
        (old.agentRun && fresh.agentRun ? sameRun(old.agentRun, fresh.agentRun) : old.agentRun === fresh.agentRun) &&
        sameTurns(old.runTurns, fresh.runTurns);
      next.set(id, unchanged ? old : fresh);
    }
    previous.clear();
    for (const [id, props] of next) previous.set(id, props);
    return { absorbed: layout.absorbed, propsOf: (turnId: string) => next.get(turnId) ?? NONE };
  }, [turns, disabled, previous]);
}
