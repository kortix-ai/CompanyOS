'use client';

import type { Drive } from '@kortix/sdk';
import { getFileIcon, useDriveFolder } from '@kortix/ui/files';
import { useFilesStore } from '@kortix/ui/internal/stores/files-store';
import { ErrorState } from '@kortix/ui/error-state';
import { Button } from '@kortix/ui/button';
import { Home } from '@kortix/ui/internal/icons/home';
import { Skeleton } from '@kortix/ui/skeleton';
import { cn } from '@kortix/ui';
import { BuildingsIcon, CaretRightIcon, FolderSimpleIcon, HardDrivesIcon, HashIcon, UserIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { type ComponentType, type ReactNode, useCallback, useEffect, useId, useState } from 'react';

import { useTranslations } from '@/i18n/use-translations';

import { COMPANY_ROOT, type DriveNav, PEOPLE_ROOT, drivePlaces, within } from './drive-places';

type Glyph = ComponentType<{ className?: string }>;

/**
 * Where Drive navigation goes: the caller's drives and the other members'
 * desktops the API lists to them. Both exist only with `shared_drives` on;
 * off, Drive is the caller's own desktop alone.
 */
export function useDriveNav(drive: Drive): DriveNav {
  const on = !!drive.sharedDrives;
  const root = useDriveFolder(on ? drive.driveId : null, '/');
  const people = useDriveFolder(drive.driveId, PEOPLE_ROOT);
  const peopleEntries = people.data?.entries ?? [];
  return {
    placesLoading: on && root.isLoading,
    placesError: on && root.isError,
    retryPlaces: () => void root.refetch(),
    places: on ? drivePlaces(root.data?.entries ?? [], drive.sharedWithMe ?? []) : [],
    /** Other people's desktops, only as far as the API lists them to the caller. */
    members: on ? peopleEntries.filter((e) => e.type === 'dir' && e.path !== drive.personalFolder) : [],
    /** `/Users/ana.lima` → "Ana Lima". */
    personNames: new Map(peopleEntries.map((e) => [e.path, e.name] as const)),
  };
}

/** Company is the building; `/Channels` holds channels; every other drive belongs to a team. */
export function placeIcon(path: string): Glyph {
  if (path === COMPANY_ROOT) return BuildingsIcon;
  if (path === '/Channels') return HashIcon;
  return UsersThreeIcon;
}

// The sidebar row recipe (`sidebar-menu-primitives.tsx`): color-only hover with
// no transition, the active fill, the hairline focus ring.
const ROW = 'flex min-w-0 items-center rounded-md text-sm text-foreground hover:bg-hover';
const ROW_ACTIVE = 'bg-active font-medium hover:bg-active';
const FOCUS = 'outline-none focus-visible:ring-[0.6px] focus-visible:ring-kortix-base';

/** `/a/b/c` → `['/a', '/a/b', '/a/b/c']`. */
function ancestors(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  return parts.map((_, i) => `/${parts.slice(0, i + 1).join('/')}`);
}

/**
 * Beside the folder in view, three groups, each a place that expands in place:
 * the caller's own desktop; the drives (Company first, then each team drive by
 * name); and, apart, the other members' desktops the API lists to the caller.
 * The folders on the way to the one in view expand by themselves; only a
 * folder confirmed empty loses its caret.
 */
export function DriveFolderTree({
  drive,
  nav,
  path,
  onOpen,
}: {
  drive: Drive;
  nav: DriveNav;
  path: string;
  onOpen: (path: string) => void;
}) {
  const t = useTranslations('drives');
  const membersId = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(ancestors(path)));
  const [leaves, setLeaves] = useState<ReadonlySet<string>>(() => new Set());
  // Moving to a folder (from the grid, a link, the breadcrumb) opens its way here too.
  useEffect(() => {
    setExpanded((prev) => {
      const way = ancestors(path).slice(0, -1);
      if (way.every((p) => prev.has(p))) return prev;
      return new Set([...prev, ...way]);
    });
  }, [path]);
  const toggle = useCallback(
    (p: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(p)) next.delete(p);
        else next.add(p);
        return next;
      }),
    [],
  );
  const markLeaf = useCallback(
    (p: string, leaf: boolean) =>
      setLeaves((prev) => {
        if (prev.has(p) === leaf) return prev;
        const next = new Set(prev);
        if (leaf) next.add(p);
        else next.delete(p);
        return next;
      }),
    [],
  );
  const personal = drive.personalFolder;
  const tree = { drive, current: path, expanded, leaves, onToggle: toggle, onLeaf: markLeaf, onOpen };
  // Admins make a new drive at the top of Drive (New asks who may open it there).
  const admin = !!drive.sharedDrives && drive.access === 'manage';

  return (
    <nav aria-label={t('folderTree')} className="border-border hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r p-2 md:flex">
      {personal ? (
        <ul aria-label={t('personalSection')} className="space-y-0.5">
          <TreeRow {...tree} path={personal} name={t('myDrive')} icon={Home}>
            <TreeChildren {...tree} parent={personal} />
          </TreeRow>
        </ul>
      ) : null}
      {admin || nav.placesLoading || nav.placesError || nav.places.length > 0 ? (
        <ul aria-label={t('drivesSection')} className={cn('space-y-0.5', personal && 'border-border border-t pt-3')}>
          {nav.placesLoading ? (
            [0, 1].map((i) => (
              <li key={i} className="flex h-8 items-center gap-2 px-2">
                <Skeleton className="size-4 rounded-sm" />
                <Skeleton className="h-3.5 w-24 rounded-sm" />
              </li>
            ))
          ) : nav.placesError ? (
            <li>
              <ErrorState size="sm" title={t('loadError')} action={<Button variant="outline" size="sm" onClick={nav.retryPlaces}>{t('retry')}</Button>} />
            </li>
          ) : (
            nav.places.map((p) => (
              <TreeRow key={p.path} {...tree} path={p.path} name={p.name} icon={placeIcon(p.path)}>
                <TreeChildren {...tree} parent={p.path} />
              </TreeRow>
            ))
          )}
          {admin ? (
            <li>
              <button
                type="button"
                aria-current={path === '/' ? 'page' : undefined}
                onClick={() => onOpen('/')}
                className={cn(ROW, FOCUS, 'h-8 w-full gap-2 pr-2 pl-6 text-left', path === '/' && ROW_ACTIVE)}
              >
                <HardDrivesIcon className={cn('size-4 shrink-0', path === '/' ? 'text-foreground' : 'text-muted-foreground')} />
                <span className="truncate">{t('allDrives')}</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {nav.members.length > 0 ? (
        <section aria-labelledby={membersId} className="border-border space-y-1 border-t pt-3">
          <h2 id={membersId} className="text-muted-foreground px-2 text-xs font-normal">
            {t('membersSection')}
          </h2>
          <ul className="space-y-0.5">
            {nav.members.map((m) => (
              <TreeRow key={m.path} {...tree} path={m.path} name={m.name} icon={UserIcon}>
                <TreeChildren {...tree} parent={m.path} />
              </TreeRow>
            ))}
          </ul>
        </section>
      ) : null}
    </nav>
  );
}

interface TreeProps {
  drive: Drive;
  current: string;
  expanded: ReadonlySet<string>;
  leaves: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onLeaf: (path: string, leaf: boolean) => void;
  onOpen: (path: string) => void;
}

function TreeChildren({ parent, ...tree }: TreeProps & { parent: string }) {
  const t = useTranslations('drives');
  const { drive, onLeaf } = tree;
  const list = useDriveFolder(drive.driveId, parent);
  const openFileWithList = useFilesStore((s) => s.openFileWithList);
  const selectedFilePath = useFilesStore((s) => s.selectedFilePath);
  const entries = (list.data?.entries ?? [])
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => Number(b.type === 'dir') - Number(a.type === 'dir') || a.name.localeCompare(b.name));
  const loaded = list.isSuccess && !list.isFetching;
  const files = entries.filter((e) => e.type !== 'dir').map((e) => e.path);
  // Loading and failed refreshes never turn an unknown folder into a leaf.
  useEffect(() => {
    onLeaf(parent, loaded && entries.length === 0);
  }, [loaded, entries.length, parent, onLeaf]);
  if (list.isLoading) {
    return (
      <li className="py-1 pl-6">
        <Skeleton className="h-5 w-3/4 rounded-sm" />
      </li>
    );
  }
  if (list.isError) {
    return (
      <li>
        <ErrorState size="sm" title={t('loadError')} action={<Button variant="outline" size="sm" onClick={() => void list.refetch()}>{t('retry')}</Button>} />
      </li>
    );
  }
  return (
    <>
      {entries.map((e) => {
        if (e.type !== 'dir') {
          const selected = selectedFilePath === e.path;
          return (
            <li key={e.path}>
              <button
                type="button"
                title={e.name}
                aria-current={selected ? 'true' : undefined}
                onClick={() => openFileWithList(e.path, files, files.indexOf(e.path))}
                className={cn(ROW, FOCUS, 'h-7 w-full gap-1.5 pr-2 pl-6 text-left', selected && ROW_ACTIVE)}
              >
                {getFileIcon(e.name, { className: 'text-muted-foreground size-4 shrink-0' })}
                <span className="truncate">{e.name}</span>
              </button>
            </li>
          );
        }
        const channel = e.name.startsWith('#');
        return (
          <TreeRow key={e.path} {...tree} path={e.path} name={channel ? e.name.slice(1) : e.name} icon={channel ? HashIcon : FolderSimpleIcon}>
            <TreeChildren {...tree} parent={e.path} />
          </TreeRow>
        );
      })}
    </>
  );
}

/**
 * One folder: a caret that shows or hides what is inside (a disclosure, so
 * Tab and Enter work with no tree keyboard model), and its name, which opens it.
 */
function TreeRow({
  path,
  name,
  icon: Icon,
  current,
  expanded,
  leaves,
  onToggle,
  onOpen,
  children,
}: TreeProps & { path: string; name: string; icon: Glyph; children: ReactNode }) {
  const t = useTranslations('drives');
  const groupId = useId();
  const leaf = leaves.has(path);
  const open = expanded.has(path) && !leaf;
  const active = current === path;
  const inside = !active && within(current, path);
  return (
    <li>
      <div className={cn(ROW, 'h-8', active && ROW_ACTIVE)}>
        {leaf ? (
          <span aria-hidden className="size-6 shrink-0" />
        ) : (
          <button
            type="button"
            aria-label={t('treeToggle', { name })}
            aria-expanded={open}
            aria-controls={expanded.has(path) ? groupId : undefined}
            onClick={() => onToggle(path)}
            className={cn(FOCUS, 'text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-sm')}
          >
            <CaretRightIcon className={cn('size-3', open && 'rotate-90')} />
          </button>
        )}
        <button
          type="button"
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            onOpen(path);
            if (!expanded.has(path)) onToggle(path);
          }}
          className={cn(FOCUS, 'flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left')}
          title={name}
        >
          <Icon className={cn('size-4 shrink-0', active || inside ? 'text-foreground' : 'text-muted-foreground')} />
          <span className="truncate">{name}</span>
        </button>
      </div>
      {/* Mounted while expanded, also for a folder still loading: its listing decides the caret. */}
      {expanded.has(path) ? (
        <ul id={groupId} className={cn('space-y-0.5 pl-3', leaf && 'hidden')}>
          {children}
        </ul>
      ) : null}
    </li>
  );
}
