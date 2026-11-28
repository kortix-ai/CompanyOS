'use client';

import { useArtifacts, useProjectApps } from '@kortix/sdk/react';
import type { ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { HoverPrefetchLink } from '../../internal/components/hover-prefetch-link';
import { NavHoverCardContent, NavHoverCardList, useNavHoverCard } from '../../internal/layout/nav-hover-card';
import { PROJECT_ACTIONS } from '../../internal/lib/project-actions';
import { useProjectCan } from '../../internal/lib/use-project-can';
import { gridApps } from '../../apps/app-shared';
import { cn } from '../../lib/utils';
import { FadedScrollArea } from '../../primitives/faded-scroll-area';
import { menuRow } from '../../primitives/menu-recipe';
import { Popover, PopoverAnchor } from '../../primitives/popover';
import { AppRow } from './footer/project-apps-nav';
import { ArtifactRow } from './footer/project-artifacts-nav';

/** Rows a rail card lists before "View all": the card is a shortcut, the page is the list. It scrolls past `max-h-72`. */
const CARD_ROWS = 20;
/** The rail card opens sooner than the sidebar row's: it also names the icon, the tooltip's job. */
const RAIL_CARD_OPEN_DELAY_MS = 200;

/** The pages whose rail icon opens a card of their items. */
export type RailCardPage = 'apps' | 'artifacts';

export function isRailCardPage(id: string): id is RailCardPage {
  return id === 'apps' || id === 'artifacts';
}

/**
 * A rail icon with a hover card instead of a tooltip: the page's name as the
 * card's first row (a link to the page), then its newest items, then "View
 * all". So a page kept on the rail shows what is in it without a click
 * (`sidebar_rail`). The trigger is the icon itself (`children`), given the
 * pointer handlers the card needs.
 */
export function RailHoverCard({
  projectId,
  page,
  label,
  href,
  children,
}: {
  projectId: string;
  page: RailCardPage;
  label: string;
  href: string;
  children: (rowProps: ReturnType<typeof useNavHoverCard>['rowProps']) => ReactNode;
}) {
  const t = useTranslations('sidebar.iconRail');
  const card = useNavHoverCard({ enabled: true, anywhere: true, openDelayMs: RAIL_CARD_OPEN_DELAY_MS });
  const close = () => card.setOpen(false);
  return (
    <Popover open={card.open} onOpenChange={card.setOpen}>
      <PopoverAnchor virtualRef={card.anchorRef} />
      {children(card.rowProps)}
      <NavHoverCardContent {...card.contentProps} className={page === 'artifacts' ? 'w-72' : 'w-60'}>
        {/* The padding is on the wrapper, not the row: a row with its own margin
            is wider than the card by that margin and its hover fill spills out. */}
        <div className="p-1 pb-0">
          <HoverPrefetchLink
            href={href}
            onClick={close}
            className={cn(menuRow('sm', 'default', 'cursor-pointer'), 'text-foreground font-medium')}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </HoverPrefetchLink>
        </div>
        <FadedScrollArea fadeColor="from-popover" fadeSize="6" className="max-h-72 overflow-x-hidden overscroll-contain">
          <NavHoverCardList>
            {page === 'apps' ? <AppsRows projectId={projectId} href={href} onOpen={close} /> : <ArtifactsRows projectId={projectId} href={href} onOpen={close} />}
          </NavHoverCardList>
        </FadedScrollArea>
        <div className="border-border border-t p-1">
          <HoverPrefetchLink href={href} onClick={close} className={menuRow('sm', 'default', 'text-muted-foreground cursor-pointer')}>
            {t('viewAll')}
          </HoverPrefetchLink>
        </div>
      </NavHoverCardContent>
    </Popover>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <li className={menuRow('sm', 'default', 'text-muted-foreground pointer-events-none')}>{children}</li>;
}

/** The Apps the page shows as cards (`gridApps`), first `CARD_ROWS`. */
function AppsRows({ projectId, href, onOpen }: { projectId: string; href: string; onOpen: () => void }) {
  const t = useTranslations('sidebar.iconRail');
  const apps = useProjectApps(projectId);
  const canAdmin = useProjectCan(projectId, PROJECT_ACTIONS.PROJECT_APP_ADMIN).allowed === true;
  const listed = apps.data ? gridApps(apps.data, canAdmin).slice(0, CARD_ROWS) : [];
  if (listed.length === 0) return <EmptyRow>{t('appsEmpty')}</EmptyRow>;
  return (
    <>
      {listed.map((app) => (
        <li key={app.app_id}>
          <AppRow app={app} href={`${href}?app=${encodeURIComponent(app.app_id)}`} onOpen={onOpen} />
        </li>
      ))}
    </>
  );
}

/** The newest artifacts, the gallery's own query (`scope: 'all'`), first `CARD_ROWS`. */
function ArtifactsRows({ projectId, href, onOpen }: { projectId: string; href: string; onOpen: () => void }) {
  const t = useTranslations('sidebar.iconRail');
  const artifacts = useArtifacts(projectId, { scope: 'all' });
  const listed = (artifacts.data ?? []).slice(0, CARD_ROWS);
  if (listed.length === 0) return <EmptyRow>{t('artifactsEmpty')}</EmptyRow>;
  return (
    <>
      {listed.map((artifact) => (
        <li key={artifact.artifact_id}>
          <ArtifactRow artifact={artifact} href={`${href}/${encodeURIComponent(artifact.artifact_id)}`} onOpen={onOpen} />
        </li>
      ))}
    </>
  );
}
