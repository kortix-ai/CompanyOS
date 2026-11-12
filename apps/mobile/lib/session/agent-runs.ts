/**
 * The agent runs of a transcript (`sessionLogAgentRuns`, KRTX-4732), as row props: a person's
 * agents report back as one unit, the turns of a run fold into the turn that answers it, and only
 * that answer stays at the top level. Port of apps/web `session/thread/agent-run-props.ts`.
 *
 * A stream delta remakes the turn list; a row whose run did not change keeps its props object,
 * so its memoized `SessionTurn` still bails out.
 */
import { sessionLogAgentRunLabel, sessionLogAgentRuns, type SessionLogTurn } from '@kortix/sdk';
import { useMemo, useState } from 'react';

/** What one transcript row receives from its agent run. */
export interface AgentRunRowProps {
  /** The run's row: "Worked for 5m · 3 agents", live "Working · 2 of 3 agents reported". */
  runLabel?: string;
  /** The run's other turns, in order: the list draws no row for them. */
  runTurns?: readonly SessionLogTurn[];
  /** Every agent this turn started has reported: its agent rows fold too. */
  foldStartedWork?: boolean;
}

export interface AgentRunLayout {
  /** The turns the list draws no row for: they fold into their run's anchor. */
  absorbed: ReadonlySet<string>;
  propsOf: (turnId: string) => AgentRunRowProps;
}

const NONE: AgentRunRowProps = Object.freeze({});
const EMPTY: AgentRunLayout = { absorbed: new Set(), propsOf: () => NONE };

const sameTurns = (a: readonly SessionLogTurn[] | undefined, b: readonly SessionLogTurn[] | undefined) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((turn, i) => turn === b[i]));

export function useAgentRunLayout(turns: readonly SessionLogTurn[]): AgentRunLayout {
  // The props each row got last time. A cache, not state: writing it never renders.
  const [previous] = useState(() => new Map<string, AgentRunRowProps>());
  return useMemo(() => {
    const layout = sessionLogAgentRuns(turns);
    if (layout.runs.size === 0 && layout.settledLaunches.size === 0) {
      previous.clear();
      return EMPTY;
    }
    const byId = new Map(turns.map((turn) => [turn.id, turn] as const));
    const next = new Map<string, AgentRunRowProps>();
    for (const id of new Set([...layout.runs.keys(), ...layout.settledLaunches])) {
      const run = layout.runs.get(id);
      const fresh: AgentRunRowProps = {
        ...(run
          ? { runLabel: sessionLogAgentRunLabel(run), runTurns: run.turns.slice(0, -1).map((turnId) => byId.get(turnId)!) }
          : {}),
        ...(layout.settledLaunches.has(id) ? { foldStartedWork: true } : {}),
      };
      const old = previous.get(id);
      const unchanged =
        old &&
        old.runLabel === fresh.runLabel &&
        !!old.foldStartedWork === !!fresh.foldStartedWork &&
        sameTurns(old.runTurns, fresh.runTurns);
      next.set(id, unchanged ? old : fresh);
    }
    previous.clear();
    for (const [id, props] of next) previous.set(id, props);
    return { absorbed: layout.absorbed, propsOf: (turnId: string) => next.get(turnId) ?? NONE };
  }, [turns, previous]);
}
