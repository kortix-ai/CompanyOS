'use client';

import type { ProjectSession, ProjectSessionGroup } from '@kortix/sdk';
import {
  useDeleteWorkspaceSessionGroup,
  useFeatureFlag,
  useWorkspaceSessionGroups,
  useWorkspaceSessions,
} from '@kortix/sdk/react';
import { MY_KORTIX_SANDBOX_SLUG, isMyKortixAgentName } from '@kortix/shared';
import {
  ChatCircleIcon,
  DotsThreeIcon,
  FolderSimpleIcon,
  PencilSimpleIcon,
  StackIcon,
  TextAlignLeftIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { FeatureGateScreen } from '../../customize/shared/feature-gate-screen';
import { useTranslations } from '../../i18n';
import { ProjectScope } from '../../internal/project-scope';
import { SidebarToggle } from '../../internal/layout/sidebar-toggle';
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
import { Skeleton } from '../../primitives/skeleton';
import { errorToast, successToast } from '../../primitives/toast';
import { UiLink as Link, useUiRouter } from '../../providers/ui-provider';
import { getSessionDisplayTitle, sessionLastActivityAt } from '../../session/actions/project-session-list-helpers';
import type { AttachmentSubmission } from '../../session/composer/attachment-submission';
import { ComposerChatInput, type ComposerOptions } from '../../session/composer/composer-chat-input';
import type { DraftScope } from '../../session/composer/draft/composer-draft';
import type { AttachedFile } from '../../session/composer/session-chat-input';
import { useProjectHomeSend } from '../layout/use-project-home-send';
import { SpaceFormModal } from './space-form-modal';

/** Rows per page of the space's sessions. */
const PAGE_SIZE = 30;
const SKELETON_WIDTHS = ['w-56', 'w-40', 'w-64', 'w-44'];

/**
 * One space (flag `session_groups`): a composer that starts each new session
 * in it, its sessions newest first, and beside them what it is for and its
 * shared Files folder (`/Company/Spaces/<group_id>`, mounted in every
 * session of the space at /drives/space).
 */
export function SpaceDetailPage({ projectId, groupId }: { projectId: string; groupId: string }) {
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
      <PageFrame projectId={projectId} name={null}>
        <ErrorState
          size="sm"
          title={t('loadFailed')}
          action={
            <Button variant="outline" size="sm" onClick={() => void groups.refetch()}>
              {t('tryAgain')}
            </Button>
          }
        />
      </PageFrame>
    );
  }
  const space = groups.data?.find((group) => group.group_id === groupId) ?? null;
  if (!space) {
    const all = uiRoutes().sessionSpaces?.(projectId);
    return (
      <PageFrame projectId={projectId} name={null}>
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
      </PageFrame>
    );
  }
  return (
    <ProjectScope projectId={projectId}>
      <SpaceView projectId={projectId} space={space} />
    </ProjectScope>
  );
}

/** The page column with its breadcrumb: "Spaces / name", the name's menu in `menu`. */
function PageFrame({
  projectId,
  name,
  menu,
  children,
}: {
  projectId: string;
  name: string | null;
  menu?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('sessionSpaces');
  const all = uiRoutes().sessionSpaces?.(projectId);
  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-20 md:px-8">
        <nav className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm" aria-label={t('title')}>
          <SidebarToggle className="-ml-2" />
          {all ? (
            <Link href={all} className="hover:text-foreground duration-fast shrink-0 transition-colors">
              {t('title')}
            </Link>
          ) : (
            <span className="shrink-0">{t('title')}</span>
          )}
          {name ? (
            <>
              <span aria-hidden>/</span>
              <span className="text-foreground min-w-0 truncate">{name}</span>
              {menu}
            </>
          ) : null}
        </nav>
        {children}
      </div>
    </div>
  );
}

function SpaceView({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  const t = useTranslations('sessionSpaces');
  const [editing, setEditing] = useState(false);
  return (
    <PageFrame projectId={projectId} name={space.name} menu={<SpaceMenu projectId={projectId} space={space} onEdit={() => setEditing(true)} />}>
      <h1 className="text-foreground text-xl font-medium text-balance">{space.name}</h1>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-8">
          <SpaceComposer projectId={projectId} space={space} />
          <SpaceSessions projectId={projectId} space={space} />
        </div>
        <aside className="space-y-1" aria-label={space.name}>
          <AsideRow
            icon={<TextAlignLeftIcon className="size-4" />}
            label={t('descriptionRow')}
            action={
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                {space.description ? t('editShort') : t('add')}
              </Button>
            }
          >
            {space.description ? (
              <p className="text-muted-foreground line-clamp-6 text-xs whitespace-pre-wrap">{space.description}</p>
            ) : null}
          </AsideRow>
          <SpaceFilesRow projectId={projectId} space={space} />
          <p className="text-muted-foreground px-2 pt-3 text-xs">{t('visibility')}</p>
        </aside>
      </div>
      <SpaceFormModal projectId={projectId} space={space} open={editing} onOpenChange={setEditing} />
    </PageFrame>
  );
}

/** One row of the side panel: a glyph, a label, an action at the right edge, and an optional body under it. */
function AsideRow({ icon, label, action, children }: { icon: ReactNode; label: string; action: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-border space-y-1 border-b py-2 last:border-b-0">
      <div className="flex items-center gap-2 pl-2">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-foreground min-w-0 flex-1 truncate text-sm">{label}</span>
        {action}
      </div>
      {children ? <div className="pr-2 pl-8">{children}</div> : null}
    </div>
  );
}

/** The space's Files folder in the Files page. Hidden when the host serves no Files page. */
function SpaceFilesRow({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  const t = useTranslations('sessionSpaces');
  const drive = uiRoutes().drive(projectId);
  if (!drive) return null;
  const href = `${drive}${drive.includes('?') ? '&' : '?'}path=Company/Spaces/${encodeURIComponent(space.group_id)}`;
  return (
    <AsideRow
      icon={<FolderSimpleIcon className="size-4" />}
      label={t('filesRow')}
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link href={href}>{t('open')}</Link>
        </Button>
      }
    />
  );
}

function SpaceMenu({ projectId, space, onEdit }: { projectId: string; space: ProjectSessionGroup; onEdit: () => void }) {
  const t = useTranslations('sessionSpaces');
  const router = useUiRouter();
  const remove = useDeleteWorkspaceSessionGroup(projectId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" type="button" aria-label={t('options')}>
            <DotsThreeIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem className="cursor-pointer" onSelect={onEdit}>
            <PencilSimpleIcon />
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <TrashIcon />
            {t('delete')}
          </DropdownMenuItem>
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
      onAgentSelectionChange={setSelectedAgent}
    />
  );
}

/** The space's top-level sessions, newest activity first, each a link to the session. */
function SpaceSessions({ projectId, space }: { projectId: string; space: ProjectSessionGroup }) {
  const t = useTranslations('sessionSpaces');
  const query = useWorkspaceSessions(projectId, { group: space.group_id, parent: 'root', limit: PAGE_SIZE });
  const rows = query.sessions.filter((session) => session.group_id === space.group_id);
  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-sm font-medium">{t('sessionsHeading')}</h2>
      {query.isLoading || query.isScanning ? (
        <ul className="space-y-2" aria-hidden>
          {SKELETON_WIDTHS.map((width) => (
            <li key={width} className="bg-popover flex items-center gap-3 rounded-md border px-3 py-2.5">
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
          media={<EmptyArt icon={ChatCircleIcon} />}
          title={t('sessionsEmptyTitle')}
          description={t('sessionsEmptyDescription')}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((session) => (
              <li key={session.session_id}>
                <SpaceSessionRow projectId={projectId} session={session} />
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

function SpaceSessionRow({ projectId, session }: { projectId: string; session: ProjectSession }) {
  const when = useMemo(() => {
    try {
      return formatDistanceToNowStrict(new Date(sessionLastActivityAt(session)), { addSuffix: false });
    } catch {
      return '';
    }
  }, [session]);
  return (
    <Link
      href={uiRoutes().session(projectId, session.session_id)}
      prefetch={false}
      className="bg-popover hover:bg-hover duration-fast flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors"
    >
      <span className="text-foreground min-w-0 flex-1 truncate text-sm">{getSessionDisplayTitle(session)}</span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{when}</span>
    </Link>
  );
}
