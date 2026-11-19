'use client';

import type { ProjectSession, ProjectSessionGroup, ProjectSpaceTab } from '@kortix/sdk';
import {
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
  FileTextIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  StackIcon,
  TrashIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { FeatureGateScreen } from '../../customize/shared/feature-gate-screen';
import { useTranslations } from '../../i18n';
import { useDebounce } from '../../internal/hooks/use-debounced-value';
import { SidebarToggle } from '../../internal/layout/sidebar-toggle';
import { ProjectScope } from '../../internal/project-scope';
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
import { Skeleton } from '../../primitives/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../primitives/tabs';
import { errorToast, successToast } from '../../primitives/toast';
import { ExpandableSearch } from '../../primitives/expandable-search';
import { ProfileHoverCard, profileLabel } from '../../primitives/profile-hover-card';
import { UserAvatar } from '../../primitives/user-avatar';
import { UiLink as Link, useUiRouter, useUiSearchParams, useUiShallowNavigate, useUiPathname } from '../../providers/ui-provider';
import { useDriveFolder, useProjectDrive } from '../../files/drives/use-drives';
import { getSessionDisplayTitle, sessionLastActivityAt } from '../../session/actions/project-session-list-helpers';
import { sessionDisplayStatus } from '../../session/actions/session-label';
import { SessionStatusMark } from '../../session/list/session-status-mark';
import type { AttachmentSubmission } from '../../session/composer/attachment-submission';
import { ComposerChatInput, type ComposerOptions } from '../../session/composer/composer-chat-input';
import type { DraftScope } from '../../session/composer/draft/composer-draft';
import type { AttachedFile } from '../../session/composer/session-chat-input';
import { useProjectHomeSend } from '../layout/use-project-home-send';
import { AddTabMenu, StoredTabBody, StoredTabTrigger, type SpaceTabsState } from '../spaces/space-tabs';
import { SpaceIconButton } from './space-icon';
import { SpaceFormModal } from './space-form-modal';
import { SpaceAudienceMark, spaceAudience, useSpaceAudienceLabel, useWorkspacePeople } from './space-people';
import { SpaceShareModal } from './space-share-modal';

/** Rows per page of the space's session history. */
const PAGE_SIZE = 30;
const SKELETON_WIDTHS = ['w-56', 'w-40', 'w-64', 'w-44'];
/** The two built-in tabs; stored tabs follow them. `?tab=` names the open one. */
const HOME_TAB = 'home';
const FILES_TAB = 'files';
/** People listed in the About rail before "N more". */
const PEOPLE_MAX = 6;
/** Files listed in the About rail before "N more". */
const FILES_MAX = 5;

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
        {/* One row: the tabs, and Share on their line. The space's icon and name head the Home tab, over the composer. */}
        <header className="border-border flex h-12 shrink-0 items-stretch gap-2 border-b px-3">
          <div className="flex shrink-0 items-center">
            <SidebarToggle />
          </div>
          {/* Full height, so the active tab's underline lands on the header's bottom border. */}
          <TabsList type="underline" size="sm" className="h-full min-w-0 flex-1 justify-start gap-4 overflow-x-auto border-b-0 px-1">
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
          <div className="flex shrink-0 items-center">
            <AudienceShare projectId={projectId} space={space} onShare={canManage ? () => setSharing(true) : undefined} />
          </div>
        </header>
        <TabsContent value={HOME_TAB} className="min-h-0 flex-1 overflow-y-auto">
          <SpaceHome
            projectId={projectId}
            space={space}
            onEdit={() => setEditing(true)}
            onShare={canManage ? () => setSharing(true) : undefined}
            onOpenFiles={() => setTab(FILES_TAB)}
          />
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
          <Button variant="ghost" size="sm" className="text-foreground min-w-0 shrink gap-1 px-1.5 text-base font-medium" aria-label={t('options')}>
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
 * Who sees the space, and Share, as one control at the right of the header:
 * the people (or the lock, or the workspace glyph) then "Share". Whoever may
 * not change the sharing sees the people alone, named on hover.
 */
function AudienceShare({ projectId, space, onShare }: { projectId: string; space: ProjectSessionGroup; onShare?: () => void }) {
  const t = useTranslations('sessionSpaces');
  const label = useSpaceAudienceLabel(space);
  if (!onShare) {
    return (
      <Hint label={label}>
        <span aria-label={label} className="flex h-8 items-center px-1.5">
          <SpaceAudienceMark projectId={projectId} space={space} />
        </span>
      </Hint>
    );
  }
  return (
    <Hint label={label}>
      <Button size="sm" variant="outline" className="gap-2" onClick={onShare}>
        <SpaceAudienceMark projectId={projectId} space={space} max={3} />
        {t('share')}
      </Button>
    </Hint>
  );
}

/**
 * Home: start a session in the space, then its history. Beside them on a wide
 * screen, what the space is about: what it is for, who is in it, its newest files.
 */
function SpaceHome({
  projectId,
  space,
  onEdit,
  onShare,
  onOpenFiles,
}: {
  projectId: string;
  space: ProjectSessionGroup;
  onEdit: () => void;
  onShare?: () => void;
  onOpenFiles: () => void;
}) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 pt-12 pb-20 md:px-8 md:pt-16 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 space-y-8">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <SpaceIconButton projectId={projectId} space={space} />
              <SpaceTitleMenu projectId={projectId} space={space} onEdit={onEdit} />
            </div>
            {space.description ? (
              // The About rail shows it on wide screens; this line is for every width.
              <button
                type="button"
                onClick={onEdit}
                className="text-muted-foreground hover:text-foreground duration-fast line-clamp-2 block text-left text-sm text-pretty transition-colors lg:hidden"
              >
                {space.description}
              </button>
            ) : null}
          </div>
          <SpaceComposer projectId={projectId} space={space} />
        </div>
        <SpaceHistory projectId={projectId} space={space} />
      </div>
      <SpaceAbout projectId={projectId} space={space} onEdit={onEdit} onShare={onShare} onOpenFiles={onOpenFiles} />
    </div>
  );
}

/** The About rail: three short blocks, each a label over its facts, on wide screens only. */
function SpaceAbout({
  projectId,
  space,
  onEdit,
  onShare,
  onOpenFiles,
}: {
  projectId: string;
  space: ProjectSessionGroup;
  onEdit: () => void;
  onShare?: () => void;
  onOpenFiles: () => void;
}) {
  const t = useTranslations('sessionSpaces');
  return (
    <aside className="hidden space-y-8 lg:block" aria-label={t('about')}>
      <AboutBlock title={t('about')} action={<AboutAction onClick={onEdit}>{t('edit')}</AboutAction>}>
        {space.description ? (
          <p className="text-muted-foreground text-sm text-pretty whitespace-pre-line">{space.description}</p>
        ) : (
          <button type="button" onClick={onEdit} className="text-muted-foreground hover:text-foreground duration-fast text-left text-sm transition-colors">
            {t('noDescription')}
          </button>
        )}
      </AboutBlock>
      <AboutBlock title={t('people')} action={onShare ? <AboutAction onClick={onShare}>{t('share')}</AboutAction> : null}>
        <SpacePeopleList projectId={projectId} space={space} />
      </AboutBlock>
      <SpaceRecentFiles projectId={projectId} space={space} onOpenFiles={onOpenFiles} />
    </aside>
  );
}

function AboutBlock({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex h-6 items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function AboutAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="transparent" size="sm" className="text-muted-foreground hover:text-foreground h-6 px-0 text-xs" onClick={onClick}>
      {children}
    </Button>
  );
}

/** Who is in the space, one row each: the whole workspace, its creator alone, or the people it is shared with. */
function SpacePeopleList({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  const t = useTranslations('sessionSpaces');
  const audience = spaceAudience(space);
  const people = useWorkspacePeople(projectId, audience.kind !== 'everyone');
  if (audience.kind === 'everyone') {
    return (
      <p className="text-foreground flex items-center gap-2 text-sm">
        <UsersThreeIcon className="text-muted-foreground size-4 shrink-0" />
        {t('visibility')}
      </p>
    );
  }
  const ids = audience.kind === 'private' ? [space.created_by].filter((id): id is string => !!id) : audience.ids;
  // A viewer who may not read the people list sees how many, never a partial list.
  const known = ids.every((id) => people.has(id)) ? ids : [];
  if (known.length === 0) {
    return (
      <p className="text-foreground flex items-center gap-2 text-sm">
        {audience.kind === 'private' ? <LockSimpleIcon className="text-muted-foreground size-4 shrink-0" /> : <UsersThreeIcon className="text-muted-foreground size-4 shrink-0" />}
        {audience.kind === 'private' ? (space.can_manage === true ? t('onlyYou') : t('private')) : t('peopleCount', { count: ids.length })}
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {known.slice(0, PEOPLE_MAX).map((id) => {
        const person = people.get(id)!;
        const profile = { userId: id, name: person.name, email: person.email, avatarUrl: person.avatarUrl };
        return (
          <li key={id}>
            <ProfileHoverCard person={profile} detail={id === space.created_by ? t('createdSpace') : undefined}>
              {/* Focusable, so the keyboard opens the card too. */}
              <div
                tabIndex={0}
                className="hover:bg-hover focus-visible:ring-ring duration-fast -mx-1.5 flex min-w-0 cursor-default items-center gap-2 rounded-md px-1.5 py-1 transition-colors outline-none focus-visible:ring-2"
              >
                <UserAvatar email={person.email} name={person.name ?? person.email} avatarUrl={person.avatarUrl} colorKey={id} size="xs" />
                <span className="text-foreground min-w-0 truncate text-sm">{profileLabel(profile)}</span>
              </div>
            </ProfileHoverCard>
          </li>
        );
      })}
      {ids.length > PEOPLE_MAX ? <li className="text-muted-foreground text-xs tabular-nums">{t('morePeople', { count: ids.length - PEOPLE_MAX })}</li> : null}
    </ul>
  );
}

/**
 * The Files block: the newest files in the space's folder, each opening the
 * Files tab. No block at all while it loads or when the folder has no files:
 * the Files tab is one click away, and an empty block is noise.
 */
function SpaceRecentFiles({ projectId, space, onOpenFiles }: { projectId: string; space: ProjectSessionGroup; onOpenFiles: () => void }) {
  const t = useTranslations('sessionSpaces');
  const drive = useProjectDrive(projectId);
  const path = sessionGroupDriveFolder(space.group_id);
  const folder = useDriveFolder(path ? (drive.data?.driveId ?? null) : null, path ?? '/');
  const files = (folder.data?.entries ?? []).filter((entry) => entry.type === 'file').sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) return null;
  return (
    <AboutBlock title={t('tabFiles')} action={<AboutAction onClick={onOpenFiles}>{t('openFiles')}</AboutAction>}>
      <ul className="space-y-0.5">
        {files.slice(0, FILES_MAX).map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={onOpenFiles}
              className="hover:bg-hover duration-fast -mx-1.5 flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors"
            >
              <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="text-foreground min-w-0 flex-1 truncate text-sm">{file.name}</span>
            </button>
          </li>
        ))}
        {files.length > FILES_MAX ? <li className="text-muted-foreground px-0 pt-1 text-xs tabular-nums">{t('moreFiles', { count: files.length - FILES_MAX })}</li> : null}
      </ul>
    </AboutBlock>
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
      {/* Every text edge in this section lines up with the heading; rows bleed their hover fill 2 units out (-mx-2 px-2). */}
      <div className="flex h-8 items-center gap-3">
        <h2 className="text-foreground text-sm font-medium">{t('sessionsHeading')}</h2>
        <div className="ml-auto flex justify-end">
          <ExpandableSearch value={search} onValueChange={setSearch} label={t('searchSessions')} size="sm" />
        </div>
      </div>
      {query.isLoading || query.isScanning ? (
        <ul className="-mx-2 space-y-1" aria-hidden>
          {SKELETON_WIDTHS.map((width) => (
            <li key={width} className="flex items-center gap-3 px-2 py-2.5">
              <Skeleton className="size-4 shrink-0 rounded-full py-0" />
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
          <div className="space-y-5">
            {byDay(rows).map((day) => (
              <section key={day.key} className="space-y-1">
                <h3 className="text-muted-foreground text-xs font-medium">{t(day.key)}</h3>
                <ul className="-mx-2">
                  {day.sessions.map((session) => (
                    <li key={session.session_id}>
                      <SessionHistoryRow projectId={projectId} session={session} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
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

/** The day buckets of the history, newest first: Today, Yesterday, This week, Earlier. Empty buckets are left out. */
function byDay(sessions: readonly ProjectSession[]): Array<{ key: 'today' | 'yesterday' | 'thisWeek' | 'earlier'; sessions: ProjectSession[] }> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  const buckets = { today: [] as ProjectSession[], yesterday: [] as ProjectSession[], thisWeek: [] as ProjectSession[], earlier: [] as ProjectSession[] };
  for (const session of sessions) {
    const at = new Date(sessionLastActivityAt(session)).getTime();
    if (at >= startOfToday.getTime()) buckets.today.push(session);
    else if (at >= startOfToday.getTime() - day) buckets.yesterday.push(session);
    else if (at >= startOfToday.getTime() - 6 * day) buckets.thisWeek.push(session);
    else buckets.earlier.push(session);
  }
  return (['today', 'yesterday', 'thisWeek', 'earlier'] as const).filter((key) => buckets[key].length > 0).map((key) => ({ key, sessions: buckets[key] }));
}

/** One session of the history: its status, its title, who started it (an avatar, named on hover), when it last moved. */
function SessionHistoryRow({ projectId, session }: { projectId: string; session: ProjectSession }) {
  const when = useMemo(() => {
    try {
      return formatDistanceToNowStrict(new Date(sessionLastActivityAt(session)), { addSuffix: true });
    } catch {
      return '';
    }
  }, [session]);
  const starter = session.owner_name?.trim() || session.initiator?.label || session.owner_email || null;
  return (
    <Link
      href={uiRoutes().session(projectId, session.session_id)}
      prefetch={false}
      className="hover:bg-hover duration-fast flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <SessionStatusMark status={sessionDisplayStatus(session)} />
      </span>
      <span className="text-foreground min-w-0 flex-1 truncate text-sm">{getSessionDisplayTitle(session)}</span>
      {starter ? (
        <ProfileHoverCard
          side="top"
          align="end"
          person={{
            userId: session.created_by ?? session.session_id,
            name: session.owner_name ?? session.initiator?.label ?? null,
            email: session.owner_email ?? null,
            avatarUrl: session.owner_avatar_url ?? null,
          }}
        >
          <span className="shrink-0">
            <UserAvatar
              email={session.owner_email ?? starter}
              name={starter}
              avatarUrl={session.owner_avatar_url}
              colorKey={session.created_by ?? session.session_id}
              size="xs"
            />
          </span>
        </ProfileHoverCard>
      ) : null}
      <span className="text-muted-foreground w-24 shrink-0 text-right text-xs tabular-nums">{when}</span>
    </Link>
  );
}
