'use client';

/**
 * `BackgroundTasksCard` — the agents this session started that work beside it:
 * its subagents and, with `agent_teams`, its teammates. One row per agent: its
 * state glyph, its name, and what it works on. A row opens that agent's session
 * in the detail panel, the same surface the chat's agent rows open.
 *
 * The data is the composer's agents line (`useAgentsLine`): the same lists, the
 * same polling. Nothing renders while the session started no agent.
 */

import { useTranslations } from '../../../i18n';
import { cn } from '../../../lib/utils';
import { useKortixComputerStore } from '../../../internal/stores/kortix-computer-store';
import { AgentStateMark } from '../../agents/agent-state-mark';
import { useAgentsLine } from '../../agents/agent-strip';
import { PANEL_ROW, PANEL_ROW_ICON, PanelCard } from './panel-card';

export function BackgroundTasksCard({
  projectId,
  sessionId,
  live,
}: {
  projectId: string | undefined;
  sessionId: string | undefined;
  /** The session works now: the lists poll every 5 s instead of every 30 s. */
  live: boolean;
}) {
  const t = useTranslations('sessionUi.panel');
  const line = useAgentsLine(projectId, sessionId, { live });
  const focusAgent = useKortixComputerStore((s) => s.focusAgent);
  const rows = [...line.agents, ...line.team];
  if (!line.ready || rows.length === 0) return null;

  return (
    <PanelCard title={t('backgroundTasks')} isEmpty={false}>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.sessionId} className="flex">
            <button
              type="button"
              onClick={() =>
                focusAgent({ sessionId: row.sessionId, title: row.handle, handle: row.handle, task: row.line ?? undefined })
              }
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
