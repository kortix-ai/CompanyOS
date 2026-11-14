'use client';

import { createSafeJSONStorage } from '@kortix/ui/internal/lib/storage/managed-storage';
import {
  registerPersistedStore,
  resetPersistedStore,
} from '@kortix/ui/internal/stores/persisted-store-registry';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HOME_GROUP } from './tab-route';

/**
 * The desktop window's tab strip, per project.
 *
 * A tab is a browser tab: it holds one location (`path`, an app pathname with
 * its query) and follows navigation inside it. Navigating in the sidebar moves
 * the ACTIVE tab; `+`, Mod+T and "New tab to the right" add one. Pinned tabs
 * sit first and render as an icon only.
 *
 * Pure state and pure transitions. Navigation (router.push) belongs to the
 * strip component, so every transition here is testable without a router.
 */

export interface DesktopTab {
  id: string;
  /** App pathname plus query, e.g. `/workspaces/<id>/sessions/<sid>`. */
  path: string;
  pinned?: boolean;
  /** Closed tabs only: where it stood, so reopening puts it back there. */
  index?: number;
}

export interface ProjectTabs {
  tabs: DesktopTab[];
  activeId: string | null;
  /** Closed tabs, most recent last, for Mod+Shift+T. */
  closed: DesktopTab[];
}

export const MAX_TABS = 24;
const MAX_CLOSED = 16;
const MAX_TRACKED_PROJECTS = 24;
const STORAGE_KEY = 'kortix.desktop-tabs';

const EMPTY: ProjectTabs = { tabs: [], activeId: null, closed: [] };

let seq = 0;
export function newTabId(): string {
  seq += 1;
  return `t${Date.now().toString(36)}${seq.toString(36)}`;
}

/** Pinned tabs first, in their order; then the rest. Stable otherwise. */
function pinnedFirst(tabs: DesktopTab[]): DesktopTab[] {
  const pinned = tabs.filter((t) => t.pinned);
  if (pinned.length === 0 || pinned.length === tabs.length) return tabs;
  return [...pinned, ...tabs.filter((t) => !t.pinned)];
}

/** `tabs` under the cap, focused on `activeId`; a tab the cap pushed out stays reopenable. */
function withCap(tabs: DesktopTab[], activeId: string, closed: DesktopTab[]): ProjectTabs {
  const kept = capTabs(tabs, activeId);
  const evicted = tabs
    .map((t, index) => ({ ...t, index }))
    .filter((t) => !kept.some((k) => k.id === t.id));
  return {
    tabs: kept,
    activeId,
    closed: evicted.length ? [...closed, ...evicted].slice(-MAX_CLOSED) : closed,
  };
}

/** Drop the oldest unpinned, inactive tab until the cap holds. */
function capTabs(tabs: DesktopTab[], activeId: string | null): DesktopTab[] {
  let next = tabs;
  while (next.length > MAX_TABS) {
    const victim = next.find((t) => !t.pinned && t.id !== activeId);
    if (!victim) break;
    next = next.filter((t) => t.id !== victim.id);
  }
  return next;
}

/* ─── Pure transitions ──────────────────────────────────────────────────── */

/**
 * The window moved to `path`. Where it lands, in order:
 *  1. The active tab is already there: nothing changes.
 *  2. Another tab holds the same destination (`groupOf`): that tab takes focus
 *     and moves to `path`. A session that has a tab, Back across a tab switch,
 *     the Customize rail's Back link to a session: none of them closes or
 *     rewrites the tab you came from.
 *  3. The active tab is the same destination, or a blank New session tab: it
 *     navigates. This is how a new session starts in place.
 *  4. Anything else opens in a new tab beside the active one.
 * A path outside the project (`groupOf` returns null) changes nothing.
 */
export function syncPath(
  state: ProjectTabs,
  path: string,
  groupOf: (path: string) => string | null,
): ProjectTabs {
  const group = groupOf(path);
  if (group === null) return state;
  const active = state.tabs.find((t) => t.id === state.activeId);
  if (active?.path === path) return state;
  const owner = state.tabs.find((t) => t.id !== active?.id && groupOf(t.path) === group);
  if (owner) {
    return {
      ...state,
      activeId: owner.id,
      tabs:
        owner.path === path
          ? state.tabs
          : state.tabs.map((t) => (t.id === owner.id ? { ...t, path } : t)),
    };
  }
  if (active) {
    const activeGroup = groupOf(active.path);
    if (activeGroup === group || activeGroup === HOME_GROUP) {
      return { ...state, tabs: state.tabs.map((t) => (t.id === active.id ? { ...t, path } : t)) };
    }
  }
  return openTab(state, path);
}

/**
 * Open `path` in a new tab after `afterId` (default: the active tab), and focus
 * it — or, with `background`, leave focus where it is (⌘-click, middle-click).
 */
export function openTab(
  state: ProjectTabs,
  path: string,
  afterId?: string | null,
  background = false,
): ProjectTabs {
  const tab: DesktopTab = { id: newTabId(), path };
  const anchor = afterId ?? state.activeId;
  const idx = state.tabs.findIndex((t) => t.id === anchor);
  // A new tab never lands inside the pinned group.
  const firstUnpinned = state.tabs.findIndex((t) => !t.pinned);
  const minIdx = firstUnpinned === -1 ? state.tabs.length : firstUnpinned;
  const at = idx === -1 ? state.tabs.length : Math.max(idx + 1, minIdx);
  const tabs = [...state.tabs.slice(0, at), tab, ...state.tabs.slice(at)];
  const opened = withCap(tabs, tab.id, state.closed);
  return background && state.activeId && opened.tabs.some((t) => t.id === state.activeId)
    ? { ...opened, activeId: state.activeId }
    : opened;
}

/**
 * Close one tab. Closing the active tab focuses its right neighbour, or the
 * left one when it was last — the browser rule. Returns the next state and the
 * path the window must show, or null when the active tab did not change.
 */
export function closeTab(
  state: ProjectTabs,
  id: string,
): { state: ProjectTabs; navigateTo: string | null } {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return { state, navigateTo: null };
  const closedTab = { ...state.tabs[idx], index: idx };
  const tabs = state.tabs.filter((t) => t.id !== id);
  const closed = [...state.closed.filter((t) => t.path !== closedTab.path), closedTab].slice(
    -MAX_CLOSED,
  );
  if (state.activeId !== id) {
    return { state: { ...state, tabs, closed }, navigateTo: null };
  }
  const next = tabs[idx] ?? tabs[idx - 1] ?? null;
  return {
    state: { tabs, closed, activeId: next?.id ?? null },
    navigateTo: next?.path ?? null,
  };
}

/** Keep only `id` (and every pinned tab). */
export function closeOthers(state: ProjectTabs, id: string): ProjectTabs {
  const keep = state.tabs.filter((t) => t.id === id || t.pinned);
  const gone = state.tabs
    .map((t, index) => ({ ...t, index }))
    .filter((t) => !keep.some((k) => k.id === t.id));
  return {
    tabs: keep,
    activeId: id,
    closed: [...state.closed, ...gone].slice(-MAX_CLOSED),
  };
}

/** Close every unpinned tab to the right of `id`. */
export function closeToRight(state: ProjectTabs, id: string): ProjectTabs {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return state;
  const gone = state.tabs
    .map((t, index) => ({ ...t, index }))
    .slice(idx + 1)
    .filter((t) => !t.pinned);
  if (gone.length === 0) return state;
  const tabs = state.tabs.filter((t) => !gone.some((g) => g.id === t.id));
  const activeId = tabs.some((t) => t.id === state.activeId) ? state.activeId : id;
  return { tabs, activeId, closed: [...state.closed, ...gone].slice(-MAX_CLOSED) };
}

export function reopenClosed(state: ProjectTabs): ProjectTabs {
  const last = state.closed.at(-1);
  if (!last) return state;
  const closed = state.closed.slice(0, -1);
  // Back where it stood (clamped to the current list), pinned state included.
  const { index = state.tabs.length, ...tab } = last;
  const at = Math.min(index, state.tabs.length);
  const tabs = pinnedFirst([...state.tabs.slice(0, at), tab, ...state.tabs.slice(at)]);
  return withCap(tabs, tab.id, closed);
}

export function setPinned(state: ProjectTabs, id: string, pinned: boolean): ProjectTabs {
  const tabs = state.tabs.map((t) => (t.id === id ? { ...t, pinned: pinned || undefined } : t));
  // Pinning moves the tab to the end of the pinned group; unpinning moves it to
  // the start of the unpinned group. Both are what the strip shows anyway.
  const target = tabs.find((t) => t.id === id);
  if (!target) return state;
  const rest = tabs.filter((t) => t.id !== id);
  const pinnedCount = rest.filter((t) => t.pinned).length;
  const ordered = [...rest.slice(0, pinnedCount), target, ...rest.slice(pinnedCount)];
  return { ...state, tabs: ordered };
}

/** Reorder by the ids the strip reports after a drag. Pinned stay first. */
export function reorder(state: ProjectTabs, ids: string[]): ProjectTabs {
  const byId = new Map(state.tabs.map((t) => [t.id, t]));
  const tabs = ids.map((id) => byId.get(id)).filter((t): t is DesktopTab => !!t);
  if (tabs.length !== state.tabs.length) return state;
  return { ...state, tabs: pinnedFirst(tabs) };
}

/* ─── Persisted shape ───────────────────────────────────────────────────── */

function cleanTab(value: unknown): DesktopTab | null {
  if (!value || typeof value !== 'object') return null;
  const { id, path, pinned, index } = value as Record<string, unknown>;
  if (typeof id !== 'string' || typeof path !== 'string') return null;
  const tab: DesktopTab = { id, path };
  if (pinned === true) tab.pinned = true;
  if (typeof index === 'number' && Number.isInteger(index) && index >= 0) tab.index = index;
  return tab;
}

function cleanTabs(value: unknown): DesktopTab[] {
  return Array.isArray(value) ? value.map(cleanTab).filter((t): t is DesktopTab => t !== null) : [];
}

/**
 * The stored value, as read back from local storage, reduced to the shape the
 * strip renders. Old versions, a full bucket written halfway, or a hand-edited
 * profile can hold anything; a tab whose `path` is not a string used to throw
 * in render and take the project shell down with it.
 */
export function sanitizePersisted(value: unknown): { byProject: Record<string, ProjectTabs> } {
  const byProject: Record<string, ProjectTabs> = {};
  const raw =
    value && typeof value === 'object' ? (value as { byProject?: unknown }).byProject : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { byProject };
  for (const [projectId, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { tabs: rawTabs, activeId, closed } = entry as Record<string, unknown>;
    const tabs = cleanTabs(rawTabs);
    byProject[projectId] = {
      tabs,
      activeId:
        typeof activeId === 'string' && tabs.some((t) => t.id === activeId) ? activeId : null,
      closed: cleanTabs(closed),
    };
  }
  return { byProject };
}

/* ─── Store ─────────────────────────────────────────────────────────────── */

interface Store {
  byProject: Record<string, ProjectTabs>;
  update: (projectId: string, fn: (state: ProjectTabs) => ProjectTabs) => void;
}

export function readProjectTabs(projectId: string): ProjectTabs {
  return useDesktopTabsStore.getState().byProject[projectId] ?? EMPTY;
}

function pruneProjects<V>(map: Record<string, V>): Record<string, V> {
  const keys = Object.keys(map);
  if (keys.length <= MAX_TRACKED_PROJECTS) return map;
  return Object.fromEntries(keys.slice(-MAX_TRACKED_PROJECTS).map((k) => [k, map[k]]));
}

export const useDesktopTabsStore = create<Store>()(
  persist(
    (set, get) => ({
      byProject: {},
      update: (projectId, fn) => {
        const current = get().byProject[projectId] ?? EMPTY;
        const next = fn(current);
        if (next === current) return;
        // Re-insert the key last: map order is the recency order pruning keeps.
        const { [projectId]: _drop, ...rest } = get().byProject;
        set({ byProject: { ...rest, [projectId]: next } });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createSafeJSONStorage(),
      partialize: (state) => ({ byProject: pruneProjects(state.byProject) }),
      // Never trust what comes back from storage: keep only well-formed tabs.
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);

export const EMPTY_PROJECT_TABS = EMPTY;

registerPersistedStore(STORAGE_KEY, () => resetPersistedStore(useDesktopTabsStore));
