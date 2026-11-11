'use client';

import { FunnelSimpleIcon, WrenchIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useToolCalls, type ToolCallFilters } from '@kortix/sdk/react';
import type { ToolCallLogEntry, ToolCallStatus } from '@kortix/sdk';

import { useLocale, useTranslations } from '../../i18n';
import { cn } from '../../internal/lib/utils';
import { projectSessionMessageHref } from '../../internal/lib/navigation/session-href';
import { Badge } from '../../primitives/badge';
import { Button } from '../../primitives/button';
import { CountBadge } from '../../primitives/count-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu';
import { EmptyState } from '../../primitives/empty-state';
import { ErrorState } from '../../primitives/error-state';
import Hint from '../../primitives/hint';
import Loading from '../../primitives/loading';
import { Skeleton } from '../../primitives/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../primitives/table';
import { Tabs, TabsList, TabsTrigger } from '../../primitives/tabs';
import { UiLink as Link } from '../../providers/ui-provider';
import { CapabilityPageShell } from '../shared/capability-page-shell';

/** The outcome tabs, each one API status. */
const OUTCOMES = ['all', 'ok', 'denied', 'error', 'pending_approval'] as const;
type Outcome = (typeof OUTCOMES)[number];

const OUTCOME_LABEL: Record<ToolCallStatus, string> = {
  ok: 'outcomeOk',
  denied: 'outcomeDenied',
  error: 'outcomeError',
  pending_approval: 'outcomePending',
  expired: 'outcomeExpired',
  approved: 'outcomeApproved',
};

/** A refusal by policy is orange, a failure red, a run green (kortix-brand color.md, D5). */
const OUTCOME_VARIANT: Record<ToolCallStatus, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  ok: 'success',
  denied: 'warning',
  error: 'destructive',
  pending_approval: 'warning',
  expired: 'muted',
  approved: 'default',
};

/* The columns that fold away first in a narrow pane (720 px window, rail open). */
const NARROW_HIDE = {
  surface: '@max-3xl/calls:hidden',
  timing: '@max-2xl/calls:hidden',
  reason: '@max-xl/calls:hidden',
} as const;

function useTimeFormat() {
  const locale = useLocale();
  return useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    [locale],
  );
}

/** A filter of one field, as a submenu of the values the loaded rows carry. */
function FilterSub({
  label,
  value,
  options,
  empty,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  empty: string;
  onChange: (next: string | undefined) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex-1">{label}</span>
        {value ? <span className="bg-foreground size-1.5 rounded-full" aria-hidden /> : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
        {options.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">{empty}</p>
        ) : (
          <DropdownMenuRadioGroup value={value ?? ''} onValueChange={(next) => onChange(next === value ? undefined : next)}>
            {options.map((option) => (
              <DropdownMenuRadioItem key={option} value={option} onSelect={(e) => e.preventDefault()}>
                <span className="min-w-0 flex-1 truncate font-mono">{option}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function ToolCallRow({ projectId, row, time }: { projectId: string; row: ToolCallLogEntry; time: Intl.DateTimeFormat }) {
  const t = useTranslations('toolCalls');
  const by = row.agent_slug ?? row.acting_user_email ?? row.acting_user_id ?? '—';
  const at = new Date(row.created_at).getTime();
  const href = row.session_id
    ? projectSessionMessageHref(projectId, row.session_id, { at: Number.isFinite(at) ? at : null })
    : null;
  const ms = (value: number | null) => (value === null ? '—' : String(value));
  return (
    <TableRow data-slot="tool-call-row">
      <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
        {time.format(new Date(row.created_at))}
      </TableCell>
      <TableCell className="max-w-40 truncate text-sm">
        <span className={cn(row.agent_slug ? 'font-mono' : null)} title={row.agent_slug ? t('byAgent') : t('byPerson')}>
          {by}
        </span>
      </TableCell>
      <TableCell className="max-w-64 truncate font-mono text-xs">
        {href ? (
          <Link
            href={href}
            title={t('openInSession')}
            className="text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {row.action_path}
          </Link>
        ) : (
          row.action_path
        )}
      </TableCell>
      <TableCell>
        <Hint label={row.phase ? t('stoppedAt', { phase: row.phase }) : t(OUTCOME_LABEL[row.status])}>
          <Badge variant={OUTCOME_VARIANT[row.status]} size="sm">
            {t(OUTCOME_LABEL[row.status])}
          </Badge>
        </Hint>
      </TableCell>
      <TableCell className={cn('text-muted-foreground max-w-40 truncate font-mono text-xs', NARROW_HIDE.reason)}>
        {row.refusal_reason ?? '—'}
      </TableCell>
      <TableCell className={cn('text-muted-foreground text-xs', NARROW_HIDE.surface)}>{row.surface ?? '—'}</TableCell>
      <TableCell className={cn('text-muted-foreground text-right text-xs tabular-nums', NARROW_HIDE.timing)}>
        {ms(row.kortix_ms)}
      </TableCell>
      <TableCell className={cn('text-muted-foreground text-right text-xs tabular-nums', NARROW_HIDE.timing)}>
        {ms(row.upstream_ms)}
      </TableCell>
    </TableRow>
  );
}

/**
 * Workspace settings › Tool calls: every tool call the workspace's agents and
 * people made, newest first. A manager sees every call; a member sees their
 * own calls and the calls of the sessions they can open (the API decides).
 * Arguments and results never reach this page.
 */
export function ToolCallsPage({ projectId }: { projectId: string }) {
  const t = useTranslations('toolCalls');
  const time = useTimeFormat();
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [agent, setAgent] = useState<string | undefined>();
  const [connector, setConnector] = useState<string | undefined>();
  const filters: ToolCallFilters = {
    agent,
    connector,
    status: outcome === 'all' ? undefined : outcome,
  };
  const query = useToolCalls(projectId, filters);
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.tool_calls) ?? [], [query.data]);

  // The values the loaded rows carry, plus the one picked, so a pick never vanishes.
  const agents = useMemo(
    () => [...new Set([...rows.flatMap((r) => (r.agent_slug ? [r.agent_slug] : [])), ...(agent ? [agent] : [])])].sort(),
    [rows, agent],
  );
  const connectors = useMemo(
    () => [...new Set([...rows.map((r) => r.connector), ...(connector ? [connector] : [])])].sort(),
    [rows, connector],
  );
  const activeFilters = [agent, connector].filter(Boolean).length;
  const filtered = activeFilters > 0 || outcome !== 'all';
  const clear = () => {
    setAgent(undefined);
    setConnector(undefined);
    setOutcome('all');
  };

  return (
    <CapabilityPageShell
      title={t('title')}
      description={t('description')}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={outcome} onValueChange={(value) => setOutcome(value as Outcome)} className="shrink-0">
            <TabsList size="xs" aria-label={t('outcomeFilter')}>
              {OUTCOMES.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {value === 'all' ? t('outcomeAll') : t(OUTCOME_LABEL[value])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" data-slot="tool-call-filter-menu">
                <FunnelSimpleIcon className="size-3.5" />
                {t('filter')}
                {activeFilters > 0 ? <CountBadge count={activeFilters} /> : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <FilterSub label={t('agentFilter')} value={agent} options={agents} empty={t('noAgents')} onChange={setAgent} />
              <FilterSub
                label={t('connectorFilter')}
                value={connector}
                options={connectors}
                empty={t('noConnectors')}
                onChange={setConnector}
              />
              {activeFilters > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setAgent(undefined);
                      setConnector(undefined);
                    }}
                  >
                    {t('clearFilters')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="@container/calls space-y-4">
        {query.isLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState
            size="sm"
            title={t('loadError')}
            action={
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                {t('tryAgain')}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={WrenchIcon}
            size="sm"
            title={filtered ? t('emptyFilteredTitle') : t('emptyTitle')}
            description={filtered ? t('emptyFilteredDescription') : t('emptyDescription')}
            action={
              filtered ? (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={clear}>
                  <FunnelSimpleIcon className="size-3.5 shrink-0" />
                  {t('clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table className="overflow-hidden rounded-md">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('columnTime')}</TableHead>
                  <TableHead>{t('columnBy')}</TableHead>
                  <TableHead>{t('columnAction')}</TableHead>
                  <TableHead>{t('columnOutcome')}</TableHead>
                  <TableHead className={NARROW_HIDE.reason}>{t('columnReason')}</TableHead>
                  <TableHead className={NARROW_HIDE.surface}>{t('columnSurface')}</TableHead>
                  <TableHead className={cn('text-right', NARROW_HIDE.timing)}>{t('columnKortixMs')}</TableHead>
                  <TableHead className={cn('text-right', NARROW_HIDE.timing)}>{t('columnUpstreamMs')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <ToolCallRow key={row.execution_id} projectId={projectId} row={row} time={time} />
                ))}
              </TableBody>
            </Table>
            {query.hasNextPage ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                >
                  {query.isFetchingNextPage ? <Loading className="size-3.5 shrink-0" /> : null}
                  {t('loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </CapabilityPageShell>
  );
}
