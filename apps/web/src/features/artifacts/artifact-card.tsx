'use client';

import {
  PROJECT_WIDE_SPACE,
  type App,
  type Artifact,
  type ArtifactFolder,
  type ManifestSpace,
} from '@kortix/sdk';
import { prefetchArtifact, useAppAccess, useArtifactMutations } from '@kortix/sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@kortix/ui/button';
import { ConfirmDialog } from '@kortix/ui/confirm-dialog';
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
} from '@kortix/ui/dropdown-menu';
import Hint from '@kortix/ui/hint';
import Loading from '@kortix/ui/loading';
import { errorToast, successToast } from '@kortix/ui/toast';
import {
  AppWindowIcon,
  ArrowSquareOutIcon,
  DotsThreeIcon,
  FolderIcon,
  PushPinIcon,
  PushPinSlashIcon,
  ShareNetworkIcon,
  StackSimpleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { memo, useEffect, useRef, useState } from 'react';

import { AppPreview, appCan } from '@kortix/ui/apps';
import { ArtifactFrame, artifactFrameKey } from '@kortix/ui/artifacts';

import { useLocale, useTranslations } from '@/i18n/use-translations';

import {
  VISIBILITY_ICON,
  artifactHref,
  relativeTime,
} from './artifact-meta';
import { FolderTreeRadioItems, ROOT_FOLDER } from './artifact-folder-tree';
import { ShareArtifactDialog } from './share-artifact-dialog';

/** The drag payload of a card: its id and current folder, read by a folder drop target. */
const ARTIFACT_DRAG_TYPE = 'application/x-kortix-artifact';
type ArtifactDragPayload = { artifactId: string; folderId: string | null };

export function readArtifactDrag(event: React.DragEvent): ArtifactDragPayload | null {
  try {
    const raw = event.dataTransfer.getData(ARTIFACT_DRAG_TYPE);
    return raw ? (JSON.parse(raw) as ArtifactDragPayload) : null;
  } catch {
    return null;
  }
}

export const isArtifactDrag = (event: React.DragEvent) => event.dataTransfer.types.includes(ARTIFACT_DRAG_TYPE);

/**
 * The grid's column width as `--card-w` on the grid: a card the tab or search
 * leaves out keeps exactly that width, so showing it again does not resize its
 * preview (a resized frame lays its page out again, and paints it half done).
 */
export function useColumnWidth() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const first = Number.parseFloat(getComputedStyle(node).gridTemplateColumns.split(' ')[0] ?? '');
      if (first > 0) node.style.setProperty('--card-w', `${first}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });
  return ref;
}

/** A card is the rounded preview, then a plain line under it: the name, "Updated … · visibility", the actions. */
// No position here: a shown card is `relative` (its link's ::after covers it), a filtered-out one `fixed`.
const CARD = 'group flex flex-col gap-2.5';
/** A card the tab or search leaves out: laid out at the column's width, fixed behind the page, invisible and inert. */
const CARD_HIDDEN = `${CARD} pointer-events-none fixed top-0 left-0 -z-10 w-(--card-w) opacity-0`;
const CARD_PREVIEW =
  'bg-background group-hover:border-foreground/20 group-focus-within:border-foreground/20 relative aspect-[16/10] overflow-hidden rounded-lg border transition-colors';
const CARD_FOOTER = 'flex items-start gap-2 px-0.5';

export function CreatingCard() {
  const t = useTranslations('artifacts');
  return (
    <div className={`${CARD} relative`} aria-busy>
      <div className={`${CARD_PREVIEW} grid place-items-center`}>
        <Loading />
      </div>
      <div className={CARD_FOOTER}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{t('untitledDoc')}</span>
          <span className="text-muted-foreground truncate text-xs">{t('creating')}</span>
        </span>
      </div>
    </div>
  );
}

/** Memoized: a tab, a search or another card's change does not re-render it (the list keeps each artifact's identity). */
export const ArtifactCard = memo(function ArtifactCard({
  projectId,
  artifact,
  hidden,
  space,
  current,
  spaces,
  folders = [],
}: {
  folders?: ArtifactFolder[];
  projectId: string;
  artifact: Artifact;
  hidden?: boolean;
  /** The space chip: only while every space is shown. */
  space?: string;
  /** The space the artifact resolves to now (`PROJECT_WIDE_SPACE`: project-wide). */
  current: string;
  /** Where "Move to space" can bind it. Empty (spaces off, or none): no menu. */
  spaces: ManifestSpace[];
}) {
  const t = useTranslations('artifacts');
  const locale = useLocale();
  const mutations = useArtifactMutations(projectId);
  const [sharing, setSharing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const draggable = artifact.can_manage && !hidden && folders.length > 0;
  const VisIcon = VISIBILITY_ICON[artifact.visibility];
  const href = artifactHref(projectId, artifact.artifact_id);
  const queryClient = useQueryClient();
  const warm = () => void prefetchArtifact(queryClient, projectId, artifact.artifact_id).catch(() => {});
  // Grouping only. A space keeps the owning agent; Project-wide clears both,
  // or the agent's own space would still claim the artifact.
  const moveToFolder = (next: string | null) => {
    if (next === (artifact.folder_id ?? null)) return;
    const name = next ? folders.find((f) => f.folder_id === next)?.name : t('title');
    mutations.update.mutate(
      { artifactId: artifact.artifact_id, folder_id: next },
      {
        onSuccess: () => successToast(name ? t('movedToFolder', { name }) : t('moved')),
        onError: () => errorToast(t('moveFailed')),
      },
    );
  };
  const moveTo = (target: string | null) =>
    mutations.update.mutate(
      { artifactId: artifact.artifact_id, space: target, ...(target === null ? { agent: null } : {}) },
      { onSuccess: () => successToast(t('moved')), onError: () => errorToast(t('moveFailed')) },
    );

  return (
    // A card the tab or search leaves out stays laid out at the column's width (`--card-w`), fixed
    // behind the page (no grid cell, no scroll height), invisible and inert. Not `display: none`:
    // its frame would lose its layout, and a different width would make showing it again resize
    // the frame; both paint the page half done for a frame.
    <div
      className={
        hidden
          ? CARD_HIDDEN
          : `${CARD} relative transition-opacity ${dragging ? 'opacity-40' : ''}`
      }
      inert={hidden}
      aria-hidden={hidden || undefined}
      // Drag a card onto a folder (or the Artifacts crumb) to file it there.
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              const payload: ArtifactDragPayload = { artifactId: artifact.artifact_id, folderId: artifact.folder_id ?? null };
              event.dataTransfer.setData(ARTIFACT_DRAG_TYPE, JSON.stringify(payload));
              event.dataTransfer.effectAllowed = 'move';
              setDragging(true);
            }
          : undefined
      }
      onDragEnd={draggable ? () => setDragging(false) : undefined}
    >
      <div className={CARD_PREVIEW}>
        {artifact.view_url ? (
          <ArtifactFrame
            frameKey={artifactFrameKey(artifact)}
            preview
            src={artifact.view_url}
            title={artifact.title}
            className="pointer-events-none absolute top-0 left-0 h-[400%] w-[400%] origin-top-left scale-25 border-0"
          />
        ) : null}
      </div>
      <div className={CARD_FOOTER}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The whole card is this link (its ::after covers the card); the actions sit above it. */}
          <Link
            href={href}
            // The card drags, not the link's URL.
            draggable={false}
            className="truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
            // Warm the viewer's reads before the click lands.
            onPointerEnter={warm}
            onFocus={warm}
          >
            {artifact.title}
          </Link>
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            <span className="truncate">
              {t('updated', { time: relativeTime(artifact.updated_at, locale) })}
              {space ? ` · ${space}` : null}
            </span>
            <span aria-hidden>·</span>
            <Hint label={t(`visibility.${artifact.visibility}`)} side="top" sideOffset={4}>
              <span
                role="img"
                className="relative z-10 flex shrink-0"
                aria-label={t(`visibility.${artifact.visibility}`)}
              >
                <VisIcon weight="fill" className="size-3.5" aria-hidden />
              </span>
            </Hint>
            {artifact.pinned ? <PushPinIcon weight="fill" className="size-3.5 shrink-0" aria-label={t('pinned')} /> : null}
          </span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={t('actions')} className="text-muted-foreground relative z-10 -mt-0.5 -mr-1.5 shrink-0">
              <DotsThreeIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => window.open(artifact.view_url, '_blank', 'noopener')}>
              <ArrowSquareOutIcon /> {t('openNewTab')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => mutations.pin.mutate({ artifactId: artifact.artifact_id, pinned: !artifact.pinned })}>
              {artifact.pinned ? <PushPinSlashIcon /> : <PushPinIcon />} {artifact.pinned ? t('unpin') : t('pin')}
            </DropdownMenuItem>
            {artifact.can_manage ? (
              <>
                <DropdownMenuItem onSelect={() => setSharing(true)}>
                  <ShareNetworkIcon /> {t('share')}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderIcon /> {t('moveToFolder')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[var(--radix-dropdown-menu-content-available-height)] max-w-64 overflow-y-auto">
                    <FolderTreeRadioItems
                      folders={folders}
                      value={artifact.folder_id ?? ROOT_FOLDER}
                      onValueChange={moveToFolder}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {spaces.length ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <StackSimpleIcon /> {t('moveTo')}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup
                        value={current}
                        onValueChange={(next) => {
                          if (next !== current) moveTo(next === PROJECT_WIDE_SPACE ? null : next);
                        }}
                      >
                        {spaces.map((target) => (
                          <DropdownMenuRadioItem key={target.name} value={target.name}>
                            {target.label || target.name}
                          </DropdownMenuRadioItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioItem value={PROJECT_WIDE_SPACE}>{t('projectWide')}</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(true)}>
                  <XCircleIcon /> {t('remove')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {sharing ? <ShareArtifactDialog projectId={projectId} artifact={artifact} open onOpenChange={setSharing} /> : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t('removeTitle')}
        description={t('removeHint')}
        confirmLabel={t('remove')}
        confirmVariant="destructive"
        isPending={mutations.remove.isPending}
        onConfirm={async () => {
          await mutations.remove.mutateAsync(artifact.artifact_id);
          setRemoving(false);
          successToast(t('removed'));
        }}
      />
    </div>
  );
});

/**
 * An App as an artifact (KRTX-5217): its live preview, its name and an App label. The card opens
 * the App's own page (`/apps?app=<id>`), the same link the Apps page and its sidebar use; every
 * App action stays there. `shown` is the App whose preview the card frames (`cardPreviewApp`):
 * the App itself, or the first tab of one that hides its own; null shows the App icon.
 */
export const AppArtifactCard = memo(function AppArtifactCard({
  projectId,
  app,
  shown,
  hidden,
  space,
}: {
  projectId: string;
  app: App;
  shown: App | null;
  hidden?: boolean;
  /** The space chip: only while every space is shown. */
  space?: string;
}) {
  const t = useTranslations('artifacts');
  const locale = useLocale();
  // As on the Apps page: a session only for an App the viewer may open and that offers a preview.
  const canAccess = shown?.viewer_can_access !== false;
  const access = useAppAccess(projectId, shown?.app_id ?? app.app_id, {
    policy: false,
    session: canAccess && !!shown && appCan(shown, 'preview'),
  });
  return (
    <div className={hidden ? CARD_HIDDEN : `${CARD} relative`} inert={hidden} aria-hidden={hidden || undefined}>
      <div className={CARD_PREVIEW}>
        {shown ? (
          <AppPreview
            key={shown.active_deployment_id ?? shown.app_id}
            app={shown}
            url={access.session.data?.url ?? null}
            accessError={!canAccess || access.session.isError}
            interactive={false}
            className="absolute inset-0 aspect-auto size-full"
          />
        ) : (
          <div className="bg-muted/20 text-muted-foreground absolute inset-0 grid place-items-center">
            <AppWindowIcon className="size-8" aria-hidden />
          </div>
        )}
      </div>
      <div className={CARD_FOOTER}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            href={`/workspaces/${projectId}/apps?app=${encodeURIComponent(app.app_id)}`}
            className="truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {app.name}
          </Link>
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            <AppWindowIcon weight="fill" className="size-3.5 shrink-0" aria-hidden />
            <span className="shrink-0">{t('typeApp')}</span>
            <span aria-hidden>·</span>
            <span className="truncate">
              {t('updated', { time: relativeTime(app.updated_at, locale) })}
              {space ? ` · ${space}` : null}
            </span>
          </span>
        </span>
      </div>
    </div>
  );
});
