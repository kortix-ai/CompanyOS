'use client';

import type { ProjectSession, ProjectSessionGroup, ProjectSpaceTab } from '@kortix/sdk';
import { listProjectAccess } from '@kortix/sdk';
import {
  contract,
  qk,
  useDeleteWorkspaceSessionGroup,
  useFeatureFlag,
  useSetWorkspaceSessionGroupTabs,
  useWorkspaceSessionGroups,
  useWorkspaceSessions,
} from '@kortix/sdk/react';
import { MY_KORTIX_SANDBOX_SLUG, isMyKortixAgentName, sessionGroupDriveFolder } from '@kortix/shared';
import {
  CaretDownIcon,
  ChatCircleIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  ShareNetworkIcon,
  StackIcon,
  TrashIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { FeatureGateScreen } from '../../customize/shared/feature-gate-screen';
import { useTranslations } from '../../i18n';
import { useDebounce } from '../../internal/hooks/use-debounced-value';
import { SidebarToggle } from '../../internal/layout/sidebar-toggle';
import { ProjectScope } from '../../internal/project-scope';
import { cn } from '../../lib/utils';
import { uiRoutes } from '../../lib/routes';
import { Button } from '../../primitives/button';
import { ConfirmDialog } from '../../primitives/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu';
import { EmptyArt } from '../../primitives/empty-art';
import { EmptyState } from '../../primitives/empty-state';
import { ErrorState } from '../../primitives/error-state';
import Hint from '../../primitives/hint';
import {
  InputGroupSearch,
  InputGroupSearchClear,
  InputGroupSearchIcon,
  InputGroupSearchInput,
} from '../../primitives/input-group';
import { Skeleton } from '../../primitives/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../primitives/tabs';
import { errorToast, successToast } from '../../primitives/toast';
import { UserAvatar } from '../../primitives/user-avatar';
import { UiLink as Link, useUiRouter, useUiSearchParams, useUiShallowNavigate, useUiPathname } from '../../providers/ui-provider';
import { getSessionDisplayTitle, sessionLastActivityAt } from '../../session/actions/project-session-list-helpers';
import type { AttachmentSubmission } from '../../session/composer/attachment-submission';
import { ComposerChatInput, type ComposerOptions } from '../../session/composer/composer-chat-input';
import type { DraftScope } from '../../session/composer/draft/composer-draft';
import type { AttachedFile } from '../../session/composer/session-chat-input';
import { useProjectHomeSend } from '../layout/use-project-home-send';
import { AddTabMenu, StoredTabBody, StoredTabTrigger, type SpaceTabsState } from '../spaces/space-tabs';
import { SpaceFormModal } from './space-form-modal';
import { SpaceShareModal } from './space-share-modal';

/** Rows per page of the space's session history. */
const PAGE_SIZE = 30;
const SKELETON_WIDTHS = ['w-56', 'w-40', 'w-64', 'w-44'];
/** The two built-in tabs; stored tabs follow them. `?tab=` names the open one. */
const HOME_TAB = 'home';
const FILES_TAB = 'files';
/** People shown in the header before "+N". */
const AVATARS_MAX = 4;

/** How the host renders a Drive folder or file in a tab (apps/web: the Drive explorer and file viewer). */
export interface SpaceDriveRenderers {
  renderFolder?: (folder: { path: string; place: string; ownFolder: string | null; missing: ReactNode }) => ReactNode;
  renderFile?: (file: { path: string; title: string; missing: ReactNode }) => ReactNode;
}

/**
 * One space (flag `session_groups`), laid out like a channel: a header (name,
 * what it is for, who sees it, Share), a tab row (Home, Files, the space's own
 * tabs, "+"), and the open tab under it. Home is where a session starts and
 * the space's session history lists; Files is the space's folder
 * (`/Spaces/<group_id>`, mounted in every session of the space at /drives/space).
 */
export function SpaceDetailPage({ projectId, groupId, ...renderers }: { projectId: string; groupId: string } & SpaceDriveRenderers) {
  const t = useTranslations('sessionSpaces');
  const flag = useFeatureFlag(projectId, 'session_groups');
  const groups = useWorkspaceSessionGroups(flag.enabled ? projectId : null);

  if (flag.isLoading) return null;
  if (!flag.enabled) {
    return <FeatureGateScreen featureKey="session_groups" featureName={t('title')} description={t('gateDescription')} />;
  }
  if (groups.isLoading) return null;
  if (groups.isError) {
    return (
      <CenteredState>
        <ErrorState
          size="sm"
          title={t('loadFailed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void groups.refetch()}>
              {t('tryAgain')}
            </Button>
          }
        />
      </CenteredState>
    );
  }
  const space = groups.data?.find((group) => group.group_id === groupId) ?? null;
  if (!space) {
    const all = uiRoutes().sessionSpaces?.(projectId);
    return (
      <CenteredState>
        <EmptyState
          media={<EmptyArt icon={StackIcon} />}
          title={t('notFoundTitle')}
          description={t('notFoundDescription')}
          action={
            all ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={all}>{t('allSpaces')}</Link>
              </Button>
            ) : undefined
          }
        />
      </CenteredState>
    );
  }
  return (
    <ProjectScope projectId={projectId}>
      <SpaceView projectId={projectId} space={space} {...renderers} />
    </ProjectScope>
  );
}

/** A load failure or a missing space: the sidebar opener, then the state in the middle of the page. */
function CenteredState({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center px-3">
        <SidebarToggle />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">{children}</div>
    </div>
  );
}

function SpaceView({ projectId, space, renderFolder, renderFile }: { projectId: string; space: ProjectSessionGroup } & SpaceDriveRenderers) {
  const t = useTranslations('sessionSpaces');
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canManage = space.can_manage === true;
  const state = useSessionSpaceTabs(projectId, space);
  const ownFolder = sessionGroupDriveFolder(space.group_id);

  // The open tab lives in the URL (`?tab=`), so a link opens it and Back returns.
  const searchParams = useUiSearchParams();
  const pathname = useUiPathname();
  const navigate = useUiShallowNavigate();
  const asked = searchParams?.get('tab') ?? HOME_TAB;
  const known = asked === HOME_TAB || asked === FILES_TAB || state.tabs.some((stored) => stored.id === asked);
  const tab = known ? asked : HOME_TAB;
  const setTab = useCallback(
    (next: string) => navigate(next === HOME_TAB ? pathname : `${pathname}?tab=${encodeURIComponent(next)}`, { replace: true }),
    [navigate, pathname],
  );

  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <header className="border-border shrink-0 border-b">
          <div className="flex h-12 items-center gap-2 px-3">
            <SidebarToggle />
            <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
              <StackIcon className="size-3.5" />
            </span>
            <SpaceTitleMenu projectId={projectId} space={space} onEdit={() => setEditing(true)} />
            {space.description ? (
              <Hint label={space.description}>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-muted-foreground hover:text-foreground duration-fast hidden min-w-0 truncate text-left text-sm transition-colors md:block"
                >
                  {space.description}
                </button>
              </Hint>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SpacePeople projectId={projectId} space={space} onOpen={canManage ? () => setSharing(true) : undefined} />
              {canManage ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSharing(true)}>
                  <ShareNetworkIcon className="size-3.5 shrink-0" />
                  {t('share')}
                </Button>
              ) : null}
            </div>
          </div>
          <TabsList type="underline" size="sm" className="w-full justify-start gap-4 overflow-x-auto px-4">
            <TabsTrigger value={HOME_TAB} className="w-fit flex-none">
              {t('tabHome')}
            </TabsTrigger>
            <TabsTrigger value={FILES_TAB} className="w-fit flex-none">
              {t('tabFiles')}
            </TabsTrigger>
            {state.tabs.map((stored, index) => (
              <StoredTabTrigger key={stored.id} tab={stored} index={index} active={stored.id === tab} state={state} />
            ))}
            <AddTabMenu projectId={projectId} ownFolder={ownFolder} ownFolderTab={false} state={state} onAdded={setTab} />
          </TabsList>
        </header>
        <TabsContent value={HOME_TAB} className="min-h-0 flex-1 overflow-y-auto">
          <SpaceHome projectId={projectId} space={space} />
        </TabsContent>
        <TabsContent value={FILES_TAB} className="flex min-h-0 flex-1 flex-col">
          {ownFolder && renderFolder
            ? renderFolder({ path: ownFolder, place: space.name, ownFolder, missing: null })
            : null}
        </TabsContent>
        {state.tabs.map((stored) => (
          <TabsContent key={stored.id} value={stored.id} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <StoredTabBody
              projectId={projectId}
              tab={stored}
              state={state}
              folder={renderFolder ? (path, missing) => renderFolder({ path, place: space.name, ownFolder, missing }) : undefined}
              file={renderFile ? (path, title, missing) => renderFile({ path, title, missing }) : undefined}
            />
          </TabsContent>
        ))}
      </Tabs>
      <SpaceFormModal projectId={projectId} space={space} open={editing} onOpenChange={setEditing} />
      {canManage ? <SpaceShareModal projectId={projectId} space={space} open={sharing} onOpenChange={setSharing} /> : null}
    </div>
  );
}

/** The space's stored tabs and the write that replaces them; everyone who sees the space may edit them. */
function useSessionSpaceTabs(projectId: string, space: ProjectSessionGroup): SpaceTabsState {
  const t = useTranslations('spaces.view.tabEdit');
  const mutation = useSetWorkspaceSessionGroupTabs(projectId);
  const saved = space.tabs ?? [];
  const tabs = mutation.isPending && mutation.variables?.groupId === space.group_id ? mutation.variables.tabs : saved;
  const save = (next: ProjectSpaceTab[]) =>
    mutation.mutateAsync({ groupId: space.group_id, tabs: next }).catch((error: unknown) => {
      errorToast(t('saveError'), { description: error instanceof Error ? error.message : undefined });
      throw error;
    });
  return { tabs, canEdit: true, save };
}

/** The name, with its menu: Edit details for everyone who sees the space, Delete for whoever may manage it. */
function SpaceTitleMenu({ projectId, space, onEdit }: { projectId: string; space: ProjectSessionGroup; onEdit: () => void }) {
  const t = useTranslations('sessionSpaces');
  const router = useUiRouter();
  const remove = useDeleteWorkspaceSessionGroup(projectId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-foreground -ml-1 min-w-0 shrink gap-1 px-1.5 text-sm font-medium" aria-label={t('options')}>
            <span className="truncate">{space.name}</span>
            <CaretDownIcon className="text-muted-foreground size-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem className="cursor-pointer" onSelect={onEdit}>
            <PencilSimpleIcon />
            {t('editDetails')}
          </DropdownMenuItem>
          {space.can_manage === true ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" variant="destructive" onSelect={() => setConfirmOpen(true)}>
                <TrashIcon />
                {t('delete')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('deleteTitle')}
        description={t('deleteDescription', { name: space.name })}
        confirmLabel={t('delete')}
        confirmVariant="destructive"
        isPending={remove.isPending}
        onConfirm={() => {
          remove.mutate(space.group_id, {
            onSuccess: () => {
              successToast(t('deleted'));
              setConfirmOpen(false);
              const all = uiRoutes().sessionSpaces?.(projectId);
              router.push(all ?? uiRoutes().project(projectId));
            },
            onError: () => errorToast(t('deleteFailed')),
          });
        }}
      />
    </>
  );
}

/**
 * Who sees the space, at the right of the header: "Everyone" for a space
 * shared with the workspace; else its creator and members as avatars (a lock
 * when it is its creator's alone). The avatars need the workspace's people
 * list; a viewer who may not read it sees the count instead.
 */
function SpacePeople({ projectId, space, onOpen }: { projectId: string; space: ProjectSessionGroup; onOpen?: () => void }) {
  const t = useTranslations('sessionSpaces');
  const access = useQuery({
    queryKey: qk.project.access(projectId),
    queryFn: () => listProjectAccess(projectId),
    enabled: space.visibility !== 'project' && (space.member_ids?.length ?? 0) > 0,
    retry: false,
    ...contract('inventory'),
  });
  const label =
    space.visibility === 'project'
      ? t('visibility')
      : (space.member_ids?.length ?? 0) > 0
        ? t('sharedWith', { count: space.member_ids!.length })
        : t('private');
  let body: ReactNode;
  if (space.visibility === 'project') {
    body = (
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <UsersThreeIcon className="size-4 shrink-0" />
        <span className="hidden sm:inline">{t('everyone')}</span>
      </span>
    );
  } else if ((space.member_ids?.length ?? 0) === 0) {
    body = (
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <LockSimpleIcon className="size-4 shrink-0" />
        <span className="hidden sm:inline">{t('private')}</span>
      </span>
    );
  } else {
    const ids = [space.created_by, ...(space.member_ids ?? [])].filter((id): id is string => !!id);
    const emailOf = new Map((access.data?.members ?? []).map((member) => [member.user_id, member.email ?? '']));
    const shown = ids.slice(0, AVATARS_MAX);
    body = (
      <span className="flex items-center">
        {shown.map((id, index) => (
          <span key={id} className={cn('ring-background rounded-sm ring-2', index > 0 && '-ml-1.5')}>
            <UserAvatar email={emailOf.get(id) ?? ''} name={emailOf.get(id) || null} colorKey={id} size="xs" />
          </span>
        ))}
        {ids.length > AVATARS_MAX ? (
          <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">+{ids.length - AVATARS_MAX}</span>
        ) : null}
      </span>
    );
  }
  return (
    <Hint label={label}>
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={label} className="hover:bg-hover duration-fast flex h-8 items-center rounded-md px-1.5 transition-colors">
          {body}
        </button>
      ) : (
        <span aria-label={label} className="flex h-8 items-center px-1.5">
          {body}
        </span>
      )}
    </Hint>
  );
}

/** Home: start a session in the space, then its history. */
function SpaceHome({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-10 pb-20 md:px-8">
      <SpaceComposer projectId={projectId} space={space} />
      <SpaceHistory projectId={projectId} space={space} />
    </div>
  );
}

/**
 * The project home's composer and send, filed in this space: the session it
 * creates opens like any other. My Kortix runs on its own sandbox, as on the
 * home (`project-home.tsx`). The draft is kept per space.
 */
function SpaceComposer({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  const t = useTranslations('sessionSpaces');
  const { send, sending, draftHandoffScope } = useProjectHomeSend(projectId, { groupId: space.group_id });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const metaSelected = isMyKortixAgentName(selectedAgent);
  const draftScope = useMemo<DraftScope>(() => ({ kind: 'space', spaceId: space.group_id }), [space.group_id]);
  const handleSend = useCallback(
    (text: string, files: AttachedFile[] | undefined, options: ComposerOptions, attachments?: AttachmentSubmission) =>
      send(text, files, { ...options, ...(metaSelected ? { sandbox_slug: MY_KORTIX_SANDBOX_SLUG } : {}) }, attachments),
    [metaSelected, send],
  );
  return (
    <ComposerChatInput
      onSend={handleSend}
      projectId={projectId}
      draftScope={draftScope}
      draftHandoffScope={draftHandoffScope}
      isSending={sending}
      disabled={sending}
      clearOnSend={false}
      autoFocus
      underbarPlacement="inline"
      slashMenuPlacement="below"
      // The page column holds it: no centred max width, no inset of its own (as a channel's composer).
      parentClassName="max-w-none px-0"
      placeholder={t('composerPlaceholder', { name: space.name })}
      hint={t('composerPlaceholder', { name: space.name })}
      onAgentSelectionChange={setSelectedAgent}
    />
  );
}

/** The space's top-level sessions, newest activity first, searchable; each row opens the session. */
function SpaceHistory({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  const t = useTranslations('sessionSpaces');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 250);
  const query = useWorkspaceSessions(projectId, {
    group: space.group_id,
    parent: 'root',
    limit: PAGE_SIZE,
    ...(q ? { q } : {}),
  });
  const rows = query.sessions.filter((session) => session.group_id === space.group_id);
  return (
    <section className="space-y-3" aria-label={t('sessionsHeading')}>
      <div className="flex items-center gap-3">
        <h2 className="text-foreground text-sm font-medium">{t('sessionsHeading')}</h2>
        <div className="ml-auto w-full max-w-56">
          <InputGroupSearch>
            <InputGroupSearchIcon>
              <MagnifyingGlassIcon />
            </InputGroupSearchIcon>
            <InputGroupSearchInput
              type="text"
              autoComplete="off"
              placeholder={t('searchSessions')}
              aria-label={t('searchSessions')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <InputGroupSearchClear onClick={() => setSearch('')} />
          </InputGroupSearch>
        </div>
      </div>
      {query.isLoading || query.isScanning ? (
        <ul className="divide-border divide-y" aria-hidden>
          {SKELETON_WIDTHS.map((width) => (
            <li key={width} className="flex items-center gap-3 py-3">
              <Skeleton className="size-6 shrink-0 rounded-sm py-0" />
              <Skeleton className={`h-3.5 py-0 ${width}`} />
              <Skeleton className="ml-auto h-3 w-10 shrink-0 py-0" />
            </li>
          ))}
        </ul>
      ) : query.isError && rows.length === 0 ? (
        <ErrorState
          size="sm"
          title={t('sessionsLoadFailed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t('tryAgain')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          size="sm"
          media={<EmptyArt icon={q ? MagnifyingGlassIcon : ChatCircleIcon} />}
          title={q ? t('noSessionsMatch') : t('sessionsEmptyTitle')}
          description={q ? t('noResultsDescription') : t('sessionsEmptyDescription')}
        />
      ) : (
        <>
          <ul className="divide-border divide-y">
            {rows.map((session) => (
              <li key={session.session_id}>
                <SessionHistoryRow projectId={projectId} session={session} />
              </li>
            ))}
          </ul>
          {query.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              aria-busy={query.isFetchingNextPage || undefined}
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t('loadMore')}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** One session of the history: who started it, its title, how long ago it was active. */
function SessionHistoryRow({ projectId, session }: { projectId: string; session: ProjectSession }) {
  const when = useMemo(() => {
    try {
      return formatDistanceToNowStrict(new Date(sessionLastActivityAt(session)), { addSuffix: true });
    } catch {
      return '';
    }
  }, [session]);
  const starter = session.initiator?.label ?? null;
  const live = session.status === 'running';
  return (
    <Link
      href={uiRoutes().session(projectId, session.session_id)}
      prefetch={false}
      className="hover:bg-hover duration-fast -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
    >
      <span className="relative shrink-0">
        <UserAvatar email={starter ?? ''} name={starter} colorKey={session.created_by ?? session.session_id} size="sm" />
        {live ? <span className="bg-kortix-green ring-background absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-sm">{getSessionDisplayTitle(session)}</span>
        {starter ? <span className="text-muted-foreground block truncate text-xs">{starter}</span> : null}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{when}</span>
    </Link>
  );
}
