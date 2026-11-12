'use client';

import {
  directSubsessions,
  sessionParentId,
  type Artifact,
  type ProjectSession,
} from '@kortix/sdk';
import { useArtifact, useCachedWorkspaceSessions, useProjectSession } from '@kortix/sdk/react';
import { cn } from '@kortix/ui';
import { Button } from '@kortix/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@kortix/ui/context-menu';
import { ProjectFilesProvider } from '@kortix/ui/files/project/context';
import { useSessionChangeRequests } from '@kortix/ui/files/project/hooks/use-change-requests';
import Hint from '@kortix/ui/hint';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@kortix/ui/hover-card';
import { AgentMarkGlyph, agentMarkVars } from '@kortix/ui/internal/components/agent-mark';
import {
  useSessionNeedsYouCounts,
  useSessionsAwaitingAnswer,
} from '@kortix/ui/internal/hooks/use-review-session-summary';
import { CustomizeGlyph } from '@kortix/ui/internal/layout/project-settings-nav';
import { getSessionDisplayTitle } from '@kortix/ui/session/actions/project-session-list-helpers';
import {
  sessionDisplayStatus,
  sessionSource,
  type SessionDisplayStatus,
} from '@kortix/ui/session/actions/session-label';
import { SessionStatusMark } from '@kortix/ui/session/list/session-status-mark';
import { useSidebar } from '@kortix/ui/sidebar';
import { SessionBriefContent } from '@kortix/ui/workspace/sidebar/session-brief-hover-card';
import {
  AppWindowIcon,
  BookOpenTextIcon,
  BrainIcon,
  BrowserIcon,
  CardsThreeIcon,
  ChartBarIcon,
  ChatsCircleIcon,
  ClockCounterClockwiseIcon,
  CpuIcon,
  CreditCardIcon,
  CubeIcon,
  FileTextIcon,
  FoldersIcon,
  GearSixIcon,
  GitBranchIcon,
  GitDiffIcon,
  HardDrivesIcon,
  HashIcon,
  IdentificationBadgeIcon,
  KeyIcon,
  ListBulletsIcon,
  NavigationArrowIcon,
  PaletteIcon,
  PlugsConnectedIcon,
  PlusIcon,
  PushPinIcon,
  PushPinSlashIcon,
  QuestionIcon,
  RepeatIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  TargetIcon,
  TimerIcon,
  TrayIcon,
  UsersIcon,
  UsersThreeIcon,
  XIcon,
  type Icon,
} from '@phosphor-icons/react';
import { formatDistanceToNowStrict } from 'date-fns';
import { AnimatePresence, motion, Reorder, useReducedMotion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useTranslations } from '@/i18n/use-translations';

import {
  closeOthers,
  closeTab,
  closeToRight,
  EMPTY_PROJECT_TABS,
  openTab,
  readProjectTabs,
  reopenClosed,
  reorder,
  setPinned,
  syncPath,
  useDesktopTabsStore,
  type DesktopTab,
} from './desktop-tabs-store';
import { newTabPath, tabRoute, type TabRoute } from './tab-route';

/* ─── Strip ───────────────────────────────────────────────────────────────── */

/** The house spring (motion.md `motion.spring`): critically damped, no bounce. */
const TAB_SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const;
const INSTANT = { duration: 0 } as const;

/** Enter and exit, resolved with the input mode at the moment they run. */
const TAB_VARIANTS = {
  enter: { opacity: 0, scale: 0.96 },
  shown: { opacity: 1, scale: 1 },
  exit: (instant: boolean) =>
    instant
      ? { opacity: 0, transition: INSTANT }
      : { opacity: 0, scale: 0.96, transition: TAB_SPRING },
};

/* ─── Session signals: the sidebar's own data ─────────────────────────────── */

interface SessionSignals {
  /** A session's row in the polled session lists the sidebar reads. */
  rows: ReadonlyMap<string, ProjectSession>;
  needsYou: Record<string, number>;
  awaitingAnswer: ReadonlySet<string>;
}

const SessionSignalsContext = createContext<SessionSignals | null>(null);

const isMac = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/**
 * The desktop window's tab strip: browser tabs for the project's pages.
 *
 * It sits in the title-bar band, right of the traffic lights (or right of the
 * sidebar when the sidebar is open), and every project page renders below it.
 * A tab follows navigation; the sidebar moves the active tab, `+` and Mod+T
 * open a new one on the project home. Rendered by the project shell on the
 * desktop shell only — the web keeps the browser's own tabs.
 *
 * Cost: one zustand subscription for the list; session titles from the
 * session caches the sidebar already fills (`useCachedWorkspaceSessions`, a
 * request only for a session in no cache); one cached read per artifact tab;
 * no subscriber inside the page tree. A tab switch re-renders the strip and
 * the route, nothing else.
 */
export function DesktopTabStrip({ projectId }: { projectId: string }) {
  const t = useTranslations('desktopTabs');
  const router = useRouter();
  // A tab's location is the path WITH its query: Drive keeps the folder in
  // `?path=`, so a tab must come back to that folder, not the Drive root.
  const path = usePathname() ?? '';
  const search = useSearchParams()?.toString() ?? '';
  const pathname = search ? `${path}?${search}` : path;
  const { state: sidebarState, isMobile } = useSidebar();
  const collapsed = isMobile || sidebarState === 'collapsed';
  const reduceMotion = useReducedMotion();
  const project = useDesktopTabsStore((s) => s.byProject[projectId] ?? EMPTY_PROJECT_TABS);
  const update = useDesktopTabsStore((s) => s.update);

  // Keyboard-driven changes render instantly (motion.md: no animation on a
  // keystroke); pointer-driven ones get the enter/exit and reorder motion.
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const onKey = () => setKeyboard(true);
    // Back to pointer mode on the first move, so hover fades after typing.
    const onPointer = () => setKeyboard(false);
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('pointerdown', onPointer, { capture: true });
    window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('pointermove', onPointer, { capture: true });
    };
  }, []);
  const instant = !!reduceMotion || keyboard;

  const sessionIds = project.tabs
    .map((tab) => tabRoute(tab.path, projectId))
    .flatMap((route) => (route?.kind === 'session' ? [route.sessionId] : []));
  // The sidebar's own rows (SDK cache read): same title and status, no request.
  const rows = useCachedWorkspaceSessions(projectId, sessionIds);
  const needsYou = useSessionNeedsYouCounts(projectId);
  const awaitingAnswer = useSessionsAwaitingAnswer(projectId);
  const signals = useMemo(
    () => ({ rows, needsYou, awaitingAnswer }),
    [rows, needsYou, awaitingAnswer],
  );

  // A link click whose page has not arrived yet. When the person switches or
  // opens a tab before it lands, that navigation belongs to the tab it started
  // in, not to the tab now in front — the browser rule. `inFlight` is the
  // pending link; `handoff` is the tab switch that overtook it.
  const inFlight = useRef<string | null>(null);
  const handoff = useRef<{ stalePath: string; fromId: string | null; toPath: string } | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== window.location.origin)
        return;
      const target = `${anchor.pathname}${anchor.search}`;
      if (target !== `${window.location.pathname}${window.location.search}`) {
        inFlight.current = target;
      }
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // The window moved: the active tab follows it, or the tab already there
  // takes focus. Paths outside this project (a full-screen frame) are ignored.
  useEffect(() => {
    const late = handoff.current;
    if (late && pathname === late.stalePath) {
      // The overtaken link landed: give it to its own tab, then put the front
      // tab's page back.
      handoff.current = null;
      inFlight.current = null;
      if (late.fromId) {
        update(projectId, (s) => ({
          ...s,
          tabs: s.tabs.map((tab) => (tab.id === late.fromId ? { ...tab, path: pathname } : tab)),
        }));
      }
      router.replace(late.toPath);
      return;
    }
    // Any arrival settles the pending link: it landed, or a newer one won.
    inFlight.current = null;
    if (!tabRoute(pathname, projectId)) return;
    update(projectId, (s) => syncPath(s, pathname));
  }, [pathname, projectId, router, update]);

  // Warm every background tab's route: a click is a client transition, never a
  // cold load. Keyed on the inactive tabs, so a navigation in the active tab
  // does not re-run it.
  const pathsKey = project.tabs
    .filter((tab) => tab.id !== project.activeId)
    .map((tab) => tab.path)
    .join('\n');
  useEffect(() => {
    if (!pathsKey) return;
    for (const path of pathsKey.split('\n')) router.prefetch(path);
  }, [pathsKey, router]);

  // Read through a ref so every handler below stays referentially stable and
  // the memoised tabs do not re-render on each navigation.
  const pathnameRef = useRef(pathname);
  useLayoutEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  /** Show `path` for a tab switch that `fromId` was in front of. */
  const go = useCallback(
    (path: string | null, fromId: string | null = null) => {
      // Only a page of this project. Persisted tabs come back from local
      // storage, so a stored path is never trusted as a navigation target.
      if (!path || !tabRoute(path, projectId)) return;
      if (path !== pathnameRef.current) {
        // A newer push supersedes the pending one: the router drops it.
        handoff.current = null;
        router.push(path);
        return;
      }
      // No push (the window already shows `path`), so a pending link would
      // still land here — mark it as the overtaken tab's.
      const pending = inFlight.current;
      handoff.current = pending ? { stalePath: pending, fromId, toPath: path } : null;
    },
    [projectId, router],
  );

  const activate = useCallback(
    (id: string) => {
      const tab = readProjectTabs(projectId).tabs.find((x) => x.id === id);
      if (!tab) return;
      const from = readProjectTabs(projectId).activeId;
      update(projectId, (s) => (s.activeId === id ? s : { ...s, activeId: id }));
      go(tab.path, from);
    },
    [go, projectId, update],
  );

  const close = useCallback(
    (id: string) => {
      const result = closeTab(readProjectTabs(projectId), id);
      update(projectId, () => result.state);
      if (result.state.tabs.length === 0) {
        // The last tab closed: the window keeps one tab, on the project home.
        update(projectId, (s) => openTab(s, newTabPath(projectId)));
        go(newTabPath(projectId));
        return;
      }
      go(result.navigateTo);
    },
    [go, projectId, update],
  );

  const openNew = useCallback(
    (afterId?: string, path = newTabPath(projectId)) => {
      const from = readProjectTabs(projectId).activeId;
      update(projectId, (s) => openTab(s, path, afterId));
      // Same path (already home): the tab still opens; nothing to navigate.
      go(path, from);
    },
    [go, projectId, update],
  );

  const reopen = useCallback(() => {
    const next = reopenClosed(readProjectTabs(projectId));
    update(projectId, () => next);
    go(next.tabs.find((tab) => tab.id === next.activeId)?.path ?? null);
  }, [go, projectId, update]);

  const newToRight = useCallback((id: string) => openNew(id), [openNew]);
  const duplicate = useCallback((id: string, path: string) => openNew(id, path), [openNew]);
  const pin = useCallback(
    (id: string, pinned: boolean) => update(projectId, (s) => setPinned(s, id, pinned)),
    [projectId, update],
  );
  const closeOthersOf = useCallback(
    (id: string) => {
      const next = closeOthers(readProjectTabs(projectId), id);
      update(projectId, () => next);
      go(next.tabs.find((x) => x.id === id)?.path ?? null);
    },
    [go, projectId, update],
  );
  const closeRightOf = useCallback(
    (id: string) => {
      const next = closeToRight(readProjectTabs(projectId), id);
      update(projectId, () => next);
      go(next.tabs.find((x) => x.id === next.activeId)?.path ?? null);
    },
    [go, projectId, update],
  );

  const cycle = useCallback(
    (delta: number) => {
      const { tabs, activeId } = readProjectTabs(projectId);
      if (tabs.length < 2) return;
      const idx = Math.max(
        0,
        tabs.findIndex((tab) => tab.id === activeId),
      );
      activate(tabs[(idx + delta + tabs.length) % tabs.length].id);
    },
    [activate, projectId],
  );

  // Keyboard: Cmd on macOS, Ctrl elsewhere, like every desktop browser.
  // Capture phase: inner editors (the composer) must not swallow Mod+T.
  useEffect(() => {
    const mac = isMac();
    let lastKeyClose = 0;
    const onKey = (e: KeyboardEvent) => {
      const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!mod) return;
      const { tabs, activeId } = readProjectTabs(projectId);
      if (e.code === 'KeyT' && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) reopen();
        else openNew();
        return;
      }
      if (e.altKey && !e.shiftKey && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
        e.preventDefault();
        cycle(e.code === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (e.shiftKey && !e.altKey && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        e.preventDefault();
        cycle(e.code === 'BracketRight' ? 1 : -1);
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab cycle on every OS.
      if (e.altKey || e.shiftKey) return;
      const digit = e.code.match(/^Digit([1-9])$/)?.[1];
      if (digit) {
        const n = Number(digit);
        const target = n === 9 ? tabs.at(-1) : tabs[n - 1];
        if (!target) return;
        e.preventDefault();
        if (target.id !== activeId) activate(target.id);
        return;
      }
      // File ▸ Close Tab owns Mod+W in the shell and sends `close-tab` below.
      // A shell that predates the strip enables that item on session routes
      // only, so the keystroke reaches the page elsewhere: close here too.
      // One keystroke may arrive both ways; `lastKeyClose` lets it close once.
      if (e.code === 'KeyW' && activeId) {
        e.preventDefault();
        lastKeyClose = Date.now();
        close(activeId);
      }
    };
    const onCtrlTab = (e: KeyboardEvent) => {
      if (e.code !== 'Tab' || !e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
    };
    // File ▸ Close Tab (Mod+W) arrives as a shell command, not a keystroke.
    const onCommand = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'close-tab') return;
      // File ▸ Close Tab is a keystroke the renderer may never see.
      setKeyboard(true);
      if (Date.now() - lastKeyClose < 500) return;
      const { activeId } = readProjectTabs(projectId);
      if (activeId) close(activeId);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    window.addEventListener('keydown', onCtrlTab, { capture: true });
    window.addEventListener('kortix-desktop-command', onCommand);
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('keydown', onCtrlTab, { capture: true });
      window.removeEventListener('kortix-desktop-command', onCommand);
    };
  }, [activate, close, cycle, openNew, projectId, reopen]);

  const listRef = useRef<HTMLDivElement>(null);
  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    items[(idx + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  const mod = isMac() ? '⌘' : 'Ctrl+';

  return (
    <div
      data-kx-desktop-tabs=""
      data-sidebar-collapsed={collapsed ? '' : undefined}
      // `.kx-titlebar-row` + `.kx-titlebar-band-height`: the strip IS the band
      // row — drag region, no-drag controls, the collapsed-sidebar indent past
      // the shell's toggle and the macOS light-centred height (globals.css).
      className="kx-desktop-tabstrip kx-titlebar-row kx-titlebar-band-height bg-sidebar border-border flex h-10 shrink-0 items-center gap-1 border-b px-2"
    >
      <div
        ref={listRef}
        role="tablist"
        aria-label={t('tabs')}
        onKeyDown={onListKeyDown}
        className="flex min-w-0 flex-1 items-center"
      >
        <Reorder.Group
          as="div"
          axis="x"
          values={project.tabs.map((tab) => tab.id)}
          onReorder={(ids: string[]) => update(projectId, (s) => reorder(s, ids))}
          // Never scrolls: every tab shrinks to share the width, down to its
          // icon and then less, the way a browser's tabs do. The active tab
          // keeps room for its title and close button.
          className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden py-1"
        >
          <SessionSignalsContext.Provider value={signals}>
            {/* `custom` reaches a tab after it leaves the list, so its exit uses
              the CURRENT input mode, not the one it last rendered with. */}
            <AnimatePresence initial={false} custom={instant}>
              {project.tabs.map((tab) => (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  projectId={projectId}
                  active={tab.id === project.activeId}
                  instant={instant}
                  onActivate={activate}
                  onClose={close}
                  onNewToRight={newToRight}
                  onDuplicate={duplicate}
                  onPin={pin}
                  onCloseOthers={closeOthersOf}
                  onCloseToRight={closeRightOf}
                  canReopen={project.closed.length > 0}
                  onReopen={reopen}
                  mod={mod}
                  t={t}
                />
              ))}
            </AnimatePresence>
          </SessionSignalsContext.Provider>
          <motion.div
            layout={instant ? false : 'position'}
            transition={instant ? INSTANT : TAB_SPRING}
            // Right after the last tab.
            className="shrink-0"
          >
            <Hint side="bottom" label={`${t('newTab')} ${mod}T`}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('newTab')}
                onClick={() => openNew()}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <PlusIcon className="size-3.5 shrink-0" />
              </Button>
            </Hint>
          </motion.div>
        </Reorder.Group>
      </div>
    </div>
  );
}

/* ─── One tab ─────────────────────────────────────────────────────────────── */

type Translate = ReturnType<typeof useTranslations>;

interface TabItemProps {
  tab: DesktopTab;
  projectId: string;
  active: boolean;
  /** Keyboard action or reduced motion: no enter, exit, reorder or color motion. */
  instant: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNewToRight: (id: string) => void;
  onDuplicate: (id: string, path: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onCloseOthers: (id: string) => void;
  onCloseToRight: (id: string) => void;
  canReopen: boolean;
  onReopen: () => void;
  mod: string;
  t: Translate;
}

const TabItem = memo(function TabItem({
  tab,
  projectId,
  active,
  instant,
  onActivate,
  onClose,
  onNewToRight,
  onDuplicate,
  onPin,
  onCloseOthers,
  onCloseToRight,
  canReopen,
  onReopen,
  mod,
  t,
}: TabItemProps) {
  const route = tabRoute(tab.path, projectId);
  const pinned = !!tab.pinned;

  return (
    <Reorder.Item
      as="div"
      value={tab.id}
      layout="position"
      custom={instant}
      variants={TAB_VARIANTS}
      initial={instant ? false : 'enter'}
      animate="shown"
      exit="exit"
      transition={instant ? INSTANT : TAB_SPRING}
      whileDrag={{ zIndex: 1 }}
      className={cn(
        'relative min-w-0',
        pinned ? 'shrink-0' : 'flex-[0_1_12.5rem]',
        // The active tab keeps room for its title and close button.
        !pinned && (active ? 'min-w-24' : 'min-w-0'),
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            data-active={active ? '' : undefined}
            onPointerDown={(e) => {
              // Activate on press, like a browser tab: the page starts loading
              // before the button comes back up.
              if (e.button !== 0 || e.ctrlKey) return;
              if (!active) onActivate(tab.id);
            }}
            onAuxClick={(e) => {
              if (e.button === 1 && !pinned) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActivate(tab.id);
              }
            }}
            className={cn(
              'group/tab @container flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md text-xs select-none',
              'outline-none',
              // Only hover fades: losing or gaining selection is one step.
              instant || active
                ? 'transition-none'
                : 'hover:duration-fast transition-none hover:transition-colors hover:ease-out',
              'focus-visible:ring-ring focus-visible:ring-2',
              pinned ? 'w-8 justify-center px-0' : 'pr-1 pl-2',
              active
                ? 'bg-popover text-foreground ring-border shadow-xs ring-1'
                : 'bg-hover text-muted-foreground hover:bg-active hover:text-foreground',
            )}
          >
            <TabLabel route={route} projectId={projectId} pinned={pinned} t={t} />
            {!pinned && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={t('closeTab')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className={cn(
                  // `bg-hover` is translucent, so it reads one step above the
                  // tab's own hover fill underneath.
                  'text-muted-foreground hover:text-foreground hover:bg-hover flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm',
                  'duration-fast transition-[opacity,color,background-color] ease-out',
                  // Hidden (not removed) when idle: hover never shifts the title.
                  active ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
                  // Too narrow for a title and a close button: the tab is its icon.
                  !active && '@max-[4.5rem]:hidden',
                )}
              >
                <XIcon className="size-3 shrink-0" />
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          <ContextMenuItem onClick={() => onNewToRight(tab.id)}>
            <PlusIcon />
            {t('newTabToRight')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDuplicate(tab.id, tab.path)}>
            <CardsThreeIcon />
            {t('duplicate')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onPin(tab.id, !pinned)}>
            {pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
            {pinned ? t('unpin') : t('pin')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onClose(tab.id)}>
            <XIcon />
            {t('closeTab')}
            <ContextMenuShortcut>{`${mod}W`}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem inset onClick={() => onCloseOthers(tab.id)}>
            {t('closeOthers')}
          </ContextMenuItem>
          <ContextMenuItem inset onClick={() => onCloseToRight(tab.id)}>
            {t('closeToRight')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem inset disabled={!canReopen} onClick={onReopen}>
            {t('reopenClosed')}
            <ContextMenuShortcut>{`⇧${mod}T`}</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </Reorder.Item>
  );
});

/* ─── Icon + title ────────────────────────────────────────────────────────── */

function TabLabel({
  route,
  projectId,
  pinned,
  t,
}: {
  route: TabRoute | null;
  projectId: string;
  pinned: boolean;
  t: Translate;
}) {
  // The Project admin rail's own names, so a tab reads exactly like its row.
  const tSections = useTranslations('workspaces.settings.sections');
  if (route?.kind === 'session') {
    return <SessionLabel projectId={projectId} sessionId={route.sessionId} pinned={pinned} t={t} />;
  }
  if (route?.kind === 'artifact') {
    return (
      <ArtifactLabel projectId={projectId} artifactId={route.artifactId} pinned={pinned} t={t} />
    );
  }
  if (route?.kind === 'agent') {
    return (
      <Label
        pinned={pinned}
        title={route.name}
        icon={
          <span
            style={agentMarkVars(route.name)}
            className="flex size-4 items-center justify-center"
          >
            <AgentMarkGlyph slug={route.name} size={14} />
          </span>
        }
      />
    );
  }
  const { icon: IconComponent, title } = staticLabel(route, t, tSections);
  return (
    <Label
      pinned={pinned}
      title={title}
      icon={
        IconComponent === 'customize' ? (
          <span className="flex size-4 items-center justify-center [&_svg]:size-3.5">
            <CustomizeGlyph />
          </span>
        ) : (
          <IconComponent className="size-3.5 shrink-0" />
        )
      }
    />
  );
}

function SessionLabel({
  projectId,
  sessionId,
  pinned,
  t,
}: {
  projectId: string;
  sessionId: string;
  pinned: boolean;
  t: Translate;
}) {
  const signals = useContext(SessionSignalsContext);
  const listed = signals?.rows.get(sessionId);
  // Only a session outside the loaded lists needs its own read.
  const own = useProjectSession(projectId, sessionId, { enabled: !listed });
  const session = listed ?? own.data;
  if (!session && own.isError) {
    return (
      <Label
        pinned={pinned}
        title={t('unavailable')}
        pending
        icon={<BrowserIcon className="size-3.5 shrink-0" />}
      />
    );
  }
  // The sidebar row's inputs (project-session-list.tsx), so the glyph agrees
  // with the row: review count, and an open question over a review. Not the
  // overdue tint (yellow after 24 h): that needs the sidebar's change-request
  // list, and the tab keeps the blue "needs you" glyph instead.
  const reviewCount = signals?.needsYou[sessionId] ?? 0;
  const waitingOn = signals?.awaitingAnswer.has(sessionId) ? 'answer' : 'review';
  const status = session ? sessionDisplayStatus(session, reviewCount) : null;
  return (
    <Label
      pinned={pinned}
      title={session ? getSessionDisplayTitle(session) : t('session')}
      pending={!session}
      card={
        session && status ? (
          <SessionTabCard
            projectId={projectId}
            session={session}
            status={status}
            waitingOn={waitingOn}
          />
        ) : undefined
      }
      icon={
        session ? (
          <SessionStatusMark status={status ?? 'done'} waitingOn={waitingOn} />
        ) : (
          <span className="bg-muted-foreground size-1.5 rounded-full" />
        )
      }
    />
  );
}

function ArtifactLabel({
  projectId,
  artifactId,
  pinned,
  t,
}: {
  projectId: string;
  artifactId: string;
  pinned: boolean;
  t: Translate;
}) {
  const { data: artifact, isError } = useArtifact(projectId, artifactId);
  if (!artifact && isError) {
    return (
      <Label
        pinned={pinned}
        title={t('unavailable')}
        pending
        icon={<BrowserIcon className="size-3.5 shrink-0" />}
      />
    );
  }
  const TypeIcon = artifact?.type === 'html' ? BrowserIcon : FileTextIcon;
  return (
    <Label
      pinned={pinned}
      title={artifact?.title || t('artifact')}
      pending={!artifact}
      card={artifact ? <ArtifactTabCard artifact={artifact} /> : undefined}
      icon={<TypeIcon className="size-3.5 shrink-0" />}
    />
  );
}

function Label({
  icon,
  title,
  pinned,
  pending,
  card,
}: {
  icon: ReactNode;
  title: string;
  pinned: boolean;
  pending?: boolean;
  /** A page with more to say than its name (a session, an artifact) shows a card on hover. */
  card?: ReactNode;
}) {
  const body = (
    <span
      className={cn(
        // The hover target is the whole chip, not just its text: full height,
        // and pulled over the tab's left padding (`-ml-2 pl-2` cancels the
        // tab's `pl-2`), so a card opens flush with the tab's own left edge.
        'flex min-w-0 flex-1 items-center gap-1.5 self-stretch',
        // Icon only (pinned, or too narrow for text): centre it in the chip.
        pinned ? 'justify-center' : '-ml-2 pl-2 @max-[2.75rem]:justify-center',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span
        className={cn(
          // Truncates into the tab's fill instead of an ellipsis. Too narrow
          // for text, the title stays the tab's accessible name.
          'min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,black_calc(100%-1rem),transparent)] whitespace-nowrap @max-[2.75rem]:sr-only',
          pinned && 'sr-only',
          pending && 'text-muted-foreground',
        )}
      >
        {title}
      </span>
    </span>
  );
  if (card) {
    return (
      <HoverCard openDelay={400} closeDelay={150}>
        <HoverCardTrigger asChild>{body}</HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={6}
          className="w-72 overflow-hidden p-0"
        >
          {card}
        </HoverCardContent>
      </HoverCard>
    );
  }
  // Every other page: its full title, for a pinned tab (icon only) and a truncated one.
  return (
    <Hint side="bottom" label={title}>
      {body}
    </Hint>
  );
}

/* ─── Hover cards ─────────────────────────────────────────────────────────── */

/**
 * A session tab's card: the sidebar's own session brief (status, goal, sub-
 * agents and spawned sessions, source, labels, the change requests it opened
 * with links into Review), plus the session that spawned it. Mounted only while
 * the card is open, so its reads (this session's change requests, a parent not
 * in any list) start on hover, never for every tab.
 */
function SessionTabCard({
  projectId,
  session,
  status,
  waitingOn,
}: {
  projectId: string;
  session: ProjectSession;
  status: SessionDisplayStatus;
  waitingOn: 'answer' | 'review';
}) {
  return (
    <ProjectFilesProvider value={{ projectId, ref: '' }}>
      <SessionTabCardBody
        projectId={projectId}
        session={session}
        status={status}
        waitingOn={waitingOn}
      />
    </ProjectFilesProvider>
  );
}

function SessionTabCardBody({
  projectId,
  session,
  status,
  waitingOn,
}: {
  projectId: string;
  session: ProjectSession;
  status: SessionDisplayStatus;
  waitingOn: 'answer' | 'review';
}) {
  const tI18nComplete = useTranslations('hardcodedUi.i18nComplete');
  const { data: crs } = useSessionChangeRequests(session.session_id);
  const parentId = sessionParentId(session);
  const cachedParent = useCachedWorkspaceSessions(projectId, parentId ? [parentId] : []).get(
    parentId ?? '',
  );
  const ownParent = useProjectSession(projectId, parentId ?? '', {
    enabled: !!parentId && !cachedParent,
  });
  const parentRow = cachedParent ?? ownParent.data;
  return (
    <SessionBriefContent
      sessionId={session.session_id}
      projectId={projectId}
      title={getSessionDisplayTitle(session)}
      status={status}
      waitingOn={waitingOn}
      createdAt={session.created_at}
      source={sessionSource(session, tI18nComplete)}
      changeRequests={crs?.change_requests ?? []}
      labels={session.labels}
      spawned={!!parentId}
      parent={
        parentId && parentRow
          ? {
              title: getSessionDisplayTitle(parentRow),
              href: `/workspaces/${projectId}/sessions/${parentId}`,
            }
          : undefined
      }
      subagentCount={directSubsessions(session).length}
      spawnedCount={session.child_count ?? 0}
      onDismiss={noop}
    />
  );
}

const noop = () => {};

/** An artifact tab's card: what it is, where it lives in Files, who can see it, when it changed. */
function ArtifactTabCard({ artifact }: { artifact: Artifact }) {
  const t = useTranslations('artifacts');
  const TypeIcon = artifact.type === 'html' ? BrowserIcon : FileTextIcon;
  return (
    <div className="space-y-1.5 px-3.5 py-2.5">
      <p className="text-foreground truncate text-sm font-medium">{artifact.title}</p>
      {artifact.description ? (
        <p className="text-muted-foreground line-clamp-2 text-xs">{artifact.description}</p>
      ) : null}
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <TypeIcon aria-hidden className="size-4 shrink-0" />
        <span>{t(`type.${artifact.type}`)}</span>
        <span aria-hidden>·</span>
        <span>{t(`visibility.${artifact.visibility}`)}</span>
      </div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
        <FoldersIcon aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 truncate font-mono">{artifact.path}</span>
      </div>
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <ClockCounterClockwiseIcon aria-hidden className="size-4 shrink-0" />
        <span suppressHydrationWarning>
          {t('updated', {
            time: formatDistanceToNowStrict(new Date(artifact.updated_at), { addSuffix: true }),
          })}
        </span>
      </div>
    </div>
  );
}

/** The sidebar's New session glyph: a paper plane pointing right. */
function NewSessionIcon({ className }: { className?: string }) {
  return <NavigationArrowIcon className={cn('rotate-90', className)} />;
}

const ADMIN_ICONS: Record<string, Icon> = {
  agents: SquaresFourIcon,
  connectors: PlugsConnectedIcon,
  secrets: KeyIcon,
  skills: BookOpenTextIcon,
  drives: HardDrivesIcon,
  apps: AppWindowIcon,
  triggers: TimerIcon,
  models: CpuIcon,
  repo: FoldersIcon,
  review: GitDiffIcon,
  reminders: RepeatIcon,
  members: UsersIcon,
  general: GearSixIcon,
  security: ShieldCheckIcon,
  branding: PaletteIcon,
  'api-keys': KeyIcon,
  sandbox: CubeIcon,
  git: GitBranchIcon,
  groups: UsersThreeIcon,
  roles: IdentificationBadgeIcon,
  identity: IdentificationBadgeIcon,
  audit: ClockCounterClockwiseIcon,
  help: QuestionIcon,
  plan: CreditCardIcon,
  usage: ChartBarIcon,
  settings: GearSixIcon,
};

const SECTION_LABEL: Record<string, string> = {
  agents: 'agents',
  connectors: 'connectors',
  secrets: 'secrets',
  skills: 'skills',
  drives: 'drives',
  apps: 'apps',
  triggers: 'triggers',
  models: 'models',
  repo: 'repo',
  review: 'review',
  reminders: 'reminders',
  members: 'members',
  settings: 'settings',
};

function staticLabel(
  route: TabRoute | null,
  t: Translate,
  tSections: Translate,
): { icon: Icon | typeof NewSessionIcon | 'customize'; title: string } {
  if (!route) return { icon: BrowserIcon, title: t('page') };
  switch (route.kind) {
    case 'home':
      // Home is where a new session starts: the tab reads like the sidebar's row.
      return { icon: NewSessionIcon, title: t('newSession') };
    case 'sessions':
      return { icon: ListBulletsIcon, title: t('sessions') };
    case 'artifacts':
      return { icon: CardsThreeIcon, title: t('artifacts') };
    case 'admin':
    case 'customize': {
      const section = route.section;
      const icon = (section && ADMIN_ICONS[section]) || 'customize';
      if (!section) return { icon, title: t('customize') };
      // `api-keys` → `apiKeys`: the rail catalog keys are camelCase.
      const railKey = section.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      if (tSections.has(railKey)) return { icon, title: tSections(railKey) };
      const own = SECTION_LABEL[section];
      return { icon, title: own ? t(`sections.${own}`) : t('customize') };
    }
    case 'goal':
      return { icon: TargetIcon, title: t('goal') };
    case 'channel':
      return { icon: HashIcon, title: route.slug };
    case 'dm':
      return { icon: ChatsCircleIcon, title: route.agent };
    case 'space':
      return { icon: HashIcon, title: route.slug };
    case 'settings':
      return { icon: GearSixIcon, title: t('settings') };
    case 'page': {
      const icons: Record<typeof route.page, Icon> = {
        apps: AppWindowIcon,
        chat: ChatsCircleIcon,
        drive: HardDrivesIcon,
        files: FoldersIcon,
        goals: TargetIcon,
        inbox: TrayIcon,
        memory: BrainIcon,
        members: UsersIcon,
        channels: HashIcon,
        reminders: RepeatIcon,
      };
      return { icon: icons[route.page], title: t(`pages.${route.page}`) };
    }
  }
  return { icon: BrowserIcon, title: t('page') };
}
