'use client';

import type { ProjectSessionGroup } from '@kortix/sdk';
import { useFeatureFlag, useWorkspaceSessionGroups } from '@kortix/sdk/react';
import { MagnifyingGlassIcon, PlusIcon, StackIcon } from '@phosphor-icons/react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useState } from 'react';

import { CapabilityPageShell } from '../../customize/shared/capability-page-shell';
import { FeatureGateScreen } from '../../customize/shared/feature-gate-screen';
import { useTranslations } from '../../i18n';
import { uiRoutes } from '../../lib/routes';
import { Button } from '../../primitives/button';
import { EmptyArt } from '../../primitives/empty-art';
import { EmptyState } from '../../primitives/empty-state';
import { ErrorState } from '../../primitives/error-state';
import {
  InputGroupSearch,
  InputGroupSearchClear,
  InputGroupSearchIcon,
  InputGroupSearchInput,
} from '../../primitives/input-group';
import { Skeleton } from '../../primitives/skeleton';
import { UiLink as Link, useUiRouter } from '../../providers/ui-provider';
import { SpaceFormModal } from './space-form-modal';
import { SpaceAudienceMark, useSpaceAudienceLabel } from './space-people';

const SKELETON_KEYS = ['a', 'b', 'c', 'd'];

/**
 * The workspace's Spaces (flag `session_groups`): every space the viewer sees
 * as a card, a search over their names and what they are for, and New space.
 * A space groups sessions; its page (`SpaceDetailPage`) starts sessions in it.
 */
export function SpacesPage({ projectId }: { projectId: string }) {
  const t = useTranslations('sessionSpaces');
  const flag = useFeatureFlag(projectId, 'session_groups');
  const groups = useWorkspaceSessionGroups(flag.enabled ? projectId : null);
  const router = useUiRouter();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  if (flag.isLoading) return null;
  if (!flag.enabled) {
    return <FeatureGateScreen featureKey="session_groups" featureName={t('title')} description={t('gateDescription')} />;
  }

  const spaces = groups.data ?? [];
  const query = search.trim().toLowerCase();
  const shown = query
    ? spaces.filter(
        (space) => space.name.toLowerCase().includes(query) || (space.description ?? '').toLowerCase().includes(query),
      )
    : spaces;
  const open = (space: ProjectSessionGroup) => {
    const href = uiRoutes().sessionSpace?.(projectId, space.group_id);
    if (href) router.push(href);
  };

  return (
    <CapabilityPageShell
      title={t('title')}
      description={t('description')}
      search={
        spaces.length > 0 ? (
          <InputGroupSearch>
            <InputGroupSearchIcon>
              <MagnifyingGlassIcon />
            </InputGroupSearchIcon>
            <InputGroupSearchInput
              type="text"
              autoComplete="off"
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <InputGroupSearchClear onClick={() => setSearch('')} />
          </InputGroupSearch>
        ) : undefined
      }
      action={
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <PlusIcon className="size-3.5 shrink-0" />
          {t('newSpace')}
        </Button>
      }
    >
      {groups.isLoading ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-hidden>
          {SKELETON_KEYS.map((key) => (
            <li key={key} className="bg-popover flex h-36 flex-col gap-4 rounded-md border p-4">
              <span className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-md py-0" />
                <Skeleton className="h-3.5 w-32 py-0" />
              </span>
              <Skeleton className="h-3 w-full py-0" />
              <Skeleton className="mt-auto h-3 w-24 py-0" />
            </li>
          ))}
        </ul>
      ) : groups.isError ? (
        <ErrorState
          size="sm"
          title={t('loadFailed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void groups.refetch()}>
              {t('tryAgain')}
            </Button>
          }
        />
      ) : spaces.length === 0 ? (
        <EmptyState media={<EmptyArt icon={StackIcon} />} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : shown.length === 0 ? (
        <EmptyState
          media={<EmptyArt icon={MagnifyingGlassIcon} />}
          title={t('noResultsTitle')}
          description={t('noResultsDescription')}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((space) => (
            <li key={space.group_id}>
              <SpaceTile projectId={projectId} space={space} />
            </li>
          ))}
        </ul>
      )}
      <SpaceFormModal projectId={projectId} space={null} open={creating} onOpenChange={setCreating} onSaved={open} />
    </CapabilityPageShell>
  );
}

/**
 * One space as a card: its glyph, name and who sees it; what it is for, in up
 * to two lines; then how many sessions it holds and when one last moved.
 */
function SpaceTile({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  const t = useTranslations('sessionSpaces');
  const href = uiRoutes().sessionSpace?.(projectId, space.group_id);
  const audience = useSpaceAudienceLabel(space);
  const count = space.session_count;
  const active = space.last_activity_at ? relativeTime(space.last_activity_at) : null;
  if (!href) return null;
  return (
    <Link
      href={href}
      prefetch
      className="bg-popover hover:bg-hover duration-fast flex h-full min-h-36 flex-col gap-3 rounded-md border p-4 transition-colors"
    >
      <span className="flex items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
          <StackIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-medium">{space.name}</span>
          <span className="text-muted-foreground block truncate text-xs">{audience}</span>
        </span>
      </span>
      <span className="text-muted-foreground line-clamp-2 text-sm text-pretty">
        {space.description || t('noDescription')}
      </span>
      <span className="text-muted-foreground mt-auto flex items-center gap-3 text-xs tabular-nums">
        <span className="min-w-0 truncate">
          {count === undefined ? null : t('sessionCount', { count })}
          {count !== undefined && active ? <span aria-hidden> · </span> : null}
          {active ? t('activeAgo', { when: active }) : null}
        </span>
        <SpaceAudienceMark projectId={projectId} space={space} className="ml-auto" />
      </span>
    </Link>
  );
}

/** "3h ago" from an ISO time; empty when it does not parse. */
function relativeTime(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return formatDistanceToNowStrict(at, { addSuffix: true });
}
