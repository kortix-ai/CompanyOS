'use client';

/**
 * `BackgroundTasksCard` — the agents this session started that work beside it:
 * its subagents and, with `agent_teams`, its teammates. One row per agent that
 * is still running (or needs you, or failed): its state glyph, its name, and
 * what it works on. A row opens that agent's session in the detail panel, the
 * same surface the chat's agent rows open.
 *
 * An agent that finished moves out of the list, behind "Finished N" on the
 * section title's right edge. That opens the finished agents in the detail
 * panel as a timeline (one rail, one node per agent, newest first).
 *
 * The data is the composer's agents line (`useAgentsLine`): the same lists, the
 * same polling. Nothing renders while the session started no agent.
 */

import { useTranslations } from '../../../i18n';
import { cn } from '../../../lib/utils';
import { Button } from '../../../primitives/button';
import { useKortixComputerStore } from '../../../internal/stores/kortix-computer-store';
import { SolidCheckIcon } from '../../../internal/icons/solid-check-icon';
import { AgentStateMark } from '../../agents/agent-state-mark';
import { AgentChip } from '../../agents/agent-surface';
import type { AgentRow } from '../../agents/agent-model';
import { useAgentsLine } from '../../agents/agent-strip';
import type { Detail } from './detail-view';
import { PANEL_ROW, PANEL_ROW_ICON, PanelCard } from './panel-card';

/** A finished agent: the agents line calls both of these "done". */
export function isFinishedAgent(row: Pick<AgentRow, 'state'>): boolean {
  return row.state === 'completed' || row.state === 'idle';
}

export function BackgroundTasksCard({
  projectId,
  sessionId,
  live,
  onOpenDetail,
}: {
  projectId: string | undefined;
  sessionId: string | undefined;
  /** The session works now: the lists poll every 5 s instead of every 30 s. */
  live: boolean;
  /** Opens the finished agents in the detail panel. */
  onOpenDetail: (detail: Detail) => void;
}) {
  const t = useTranslations('sessionUi.panel');
  const line = useAgentsLine(projectId, sessionId, { live });
  const focusAgent = useKortixComputerStore((s) => s.focusAgent);
  const rows = [...line.agents, ...line.team];
  if (!line.ready || rows.length === 0) return null;

  const open = (row: AgentRow) =>
    focusAgent({ sessionId: row.sessionId, title: row.handle, handle: row.handle, task: row.line ?? undefined });
  const finished = rows.filter(isFinishedAgent).sort((a, b) => b.activityMs - a.activityMs);
  const active = rows.filter((row) => !isFinishedAgent(row));

  return (
    <PanelCard
      title={t('backgroundTasks')}
      isEmpty={active.length === 0}
      emptyText={t('noRunningTasks')}
      headerAction={
        finished.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            // The label ends on the column's text edge, not its padding.
            className="text-muted-foreground hover:text-foreground -mr-2.5 h-7 gap-1.5 px-2.5 font-normal"
            onClick={() =>
              onOpenDetail({
                key: 'finished-tasks',
                title: t('finishedTasks'),
                icon: <SolidCheckIcon className="text-muted-foreground size-4 shrink-0" />,
                body: <FinishedTasks rows={finished} onOpen={open} />,
              })
            }
          >
            {t('finished')}
            <span className="tabular-nums">{finished.length}</span>
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col">
        {active.map((row) => (
          <li key={row.sessionId} className="flex">
            <button
              type="button"
              onClick={() => open(row)}
              // The state glyph is 14px, not a 16px icon: a tighter slot and gap
              // keep it beside the name instead of floating off it.
              className={cn(PANEL_ROW, 'cursor-pointer gap-2')}
            >
              <span className={cn(PANEL_ROW_ICON, 'w-4')}>
                <AgentStateMark state={row.state} />
              </span>
              <span className="text-foreground max-w-full shrink-0 truncate">{row.handle}</span>
              {row.line && <span className="text-muted-foreground min-w-0 flex-1 truncate">{row.line}</span>}
            </button>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

/**
 * The finished agents as a timeline: one rail, one node per agent (a meta-ink
 * check), its mark and name with the time it finished on the right, and what it
 * worked on below. A node opens that agent's session.
 */
export function FinishedTasks({ rows, onOpen }: { rows: AgentRow[]; onOpen: (row: AgentRow) => void }) {
  return (
    <ol className="flex flex-col">
      {rows.map((row, index) => {
        const last = index === rows.length - 1;
        const clock = row.activityMs
          ? new Date(row.activityMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : null;
        return (
          <li key={row.sessionId} className="relative">
            {!last && <span aria-hidden className="bg-border absolute top-8 bottom-0 left-4.5 w-px" />}
            <button
              type="button"
              onClick={() => onOpen(row)}
              className="hover:bg-hover flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors duration-(--duration-fast)"
            >
              <span aria-hidden className="text-muted-foreground flex size-5 shrink-0 items-center justify-center">
                <SolidCheckIcon className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-h-5 min-w-0 items-center gap-2">
                  <AgentChip handle={row.handle} name={row.handle} plain className="max-w-none min-w-0 shrink" />
                  {clock && <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">{clock}</span>}
                </span>
                {row.line && <span className="text-muted-foreground line-clamp-2 pl-5">{row.line}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
