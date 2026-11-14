import { describe, expect, test } from 'bun:test';

import {
  closeOthers,
  closeTab,
  closeToRight,
  MAX_TABS,
  openTab,
  reopenClosed,
  reorder,
  sanitizePersisted,
  setPinned,
  syncPath,
  type ProjectTabs,
} from './desktop-tabs-store';
import { isPrototypeKey, ownEntry, pathGroup, stripVisible, tabRoute } from './tab-route';

const P = 'project-1';
const home = `/workspaces/${P}`;
const s1 = `/workspaces/${P}/sessions/s1`;
const s2 = `/workspaces/${P}/sessions/s2`;
const models = `/workspaces/${P}/admin/models`;

const g = (path: string) => pathGroup(path, P);
const empty: ProjectTabs = { tabs: [], activeId: null, closed: [] };
const s1Path = (i: number) => `${home}/sessions/x${i}`;
const paths = (s: ProjectTabs) => s.tabs.map((t) => t.path);
const activePath = (s: ProjectTabs) => s.tabs.find((t) => t.id === s.activeId)?.path;

describe('desktop tabs: navigation', () => {
  const goals = `/workspaces/${P}/goals`;
  const goal = `/workspaces/${P}/goals/g1`;
  const triggers = `/workspaces/${P}/admin/triggers`;

  test('the first navigation opens the first tab', () => {
    const s = syncPath(empty, s1, g);
    expect(paths(s)).toEqual([s1]);
    expect(activePath(s)).toBe(s1);
  });

  test('a page opened from a session gets its own tab; the session stays', () => {
    let s = syncPath(empty, s1, g);
    s = syncPath(s, goals, g);
    expect(paths(s)).toEqual([s1, goals]);
    expect(activePath(s)).toBe(goals);
  });

  test('moving inside a section stays in its tab (Customize → Triggers)', () => {
    let s = syncPath(empty, s1, g);
    s = syncPath(s, models, g);
    s = syncPath(s, triggers, g);
    expect(paths(s)).toEqual([s1, triggers]);
  });

  test("leaving Customize for a session focuses the session's tab and keeps Customize", () => {
    let s = syncPath(empty, s1, g);
    s = syncPath(s, triggers, g);
    s = syncPath(s, s1, g);
    expect(paths(s)).toEqual([s1, triggers]);
    expect(activePath(s)).toBe(s1);
  });

  test('a destination with a tab focuses that tab and moves it there', () => {
    let s = syncPath(empty, s1, g);
    s = syncPath(s, goals, g);
    s = syncPath(s, s1, g);
    s = syncPath(s, goal, g);
    expect(paths(s)).toEqual([s1, goal]);
    expect(activePath(s)).toBe(goal);
  });

  test('an artifact opened from a session gets its own tab, and so does the next one', () => {
    const a1 = `/workspaces/${P}/artifacts/a1`;
    const a2 = `/workspaces/${P}/artifacts/a2`;
    let s = syncPath(empty, s1, g);
    s = syncPath(s, a1, g);
    expect(paths(s)).toEqual([s1, a1]);
    s = syncPath(s, s1, g);
    s = syncPath(s, a2, g);
    expect(paths(s)).toEqual([s1, a2, a1]);
  });

  test('an App opened from a session opens in the Apps tab, not over the session', () => {
    const app = `/workspaces/${P}/apps?app=x1`;
    let s = syncPath(empty, s1, g);
    s = syncPath(s, app, g);
    expect(paths(s)).toEqual([s1, app]);
  });

  test('every session gets its own tab', () => {
    let s = syncPath(empty, s1, g);
    s = syncPath(s, s2, g);
    expect(paths(s)).toEqual([s1, s2]);
  });

  test('a blank New session tab is replaced by wherever you go next', () => {
    let s = syncPath(empty, home, g);
    s = syncPath(s, goals, g);
    expect(paths(s)).toEqual([goals]);
    s = openTab(s, home);
    s = syncPath(s, s2, g);
    expect(paths(s)).toEqual([goals, s2]);
  });

  test('the same path twice is a no-op (same object)', () => {
    const s = syncPath(empty, s1, g);
    expect(syncPath(s, s1, g)).toBe(s);
  });

  test('a path outside the project changes nothing', () => {
    const s = syncPath(empty, s1, g);
    expect(syncPath(s, '/settings', g)).toBe(s);
  });
});

describe('desktop tabs: when the strip shows', () => {
  const tab = (path: string) => ({ id: path, path });
  test('a fresh start (one New session or one page tab) shows no strip', () => {
    expect(stripVisible([tab(home)], home, P)).toBe(false);
    expect(stripVisible([tab(models)], models, P)).toBe(false);
  });
  test('a session, or a second tab, shows it', () => {
    expect(stripVisible([tab(s1)], s1, P)).toBe(true);
    expect(stripVisible([tab(home)], s1, P)).toBe(true);
    expect(stripVisible([tab(home), tab(models)], models, P)).toBe(true);
  });
});

describe('desktop tabs: open and close', () => {
  test('a new tab opens right of the active one and takes focus', () => {
    let s = syncPath(empty, s1, g);
    s = openTab(s, s2);
    s = { ...s, activeId: s.tabs[0].id };
    s = openTab(s, home);
    expect(paths(s)).toEqual([s1, home, s2]);
    expect(activePath(s)).toBe(home);
  });

  test('a background tab (⌘-click) opens beside the active one without taking focus', () => {
    let s = syncPath(empty, s1, g);
    s = openTab(s, s2, null, true);
    expect(paths(s)).toEqual([s1, s2]);
    expect(activePath(s)).toBe(s1);
  });

  test('closing the active tab focuses the right neighbour, then the left', () => {
    let s = syncPath(empty, s1, g);
    s = openTab(s, s2);
    s = openTab(s, models);
    s = { ...s, activeId: s.tabs[1].id };
    const a = closeTab(s, s.tabs[1].id);
    expect(a.navigateTo).toBe(models);
    const b = closeTab(a.state, a.state.activeId!);
    expect(b.navigateTo).toBe(s1);
  });

  test('closing a background tab does not navigate', () => {
    let s = syncPath(empty, s1, g);
    s = openTab(s, s2);
    const r = closeTab(s, s.tabs[0].id);
    expect(r.navigateTo).toBeNull();
    expect(paths(r.state)).toEqual([s2]);
  });

  test('reopen brings the last closed tab back to its place and focuses it', () => {
    let s = syncPath(empty, s1, g);
    s = openTab(s, s2);
    s = openTab(s, models);
    s = closeTab(s, s.tabs[1].id).state;
    s = reopenClosed(s);
    expect(paths(s)).toEqual([s1, s2, models]);
    expect(activePath(s)).toBe(s2);
    expect(s.closed).toEqual([]);
    expect(s.tabs[1].index).toBeUndefined();
  });

  test('close others and close to the right keep pinned tabs', () => {
    let s = syncPath(empty, home, g);
    s = setPinned(s, s.tabs[0].id, true);
    s = openTab(s, s1);
    s = openTab(s, s2);
    s = openTab(s, models);
    const s1Id = s.tabs[1].id;
    expect(paths(closeToRight(s, s1Id))).toEqual([home, s1]);
    const others = closeOthers(s, s1Id);
    expect(paths(others)).toEqual([home, s1]);
    expect(activePath(others)).toBe(s1);
  });

  test('the cap drops the oldest unpinned inactive tab', () => {
    let s = syncPath(empty, home, g);
    s = setPinned(s, s.tabs[0].id, true);
    for (let i = 0; i < MAX_TABS + 3; i++) s = openTab(s, `${home}/sessions/x${i}`);
    expect(s.tabs.length).toBe(MAX_TABS);
    expect(s.tabs[0].path).toBe(home);
    expect(activePath(s)).toBe(`${home}/sessions/x${MAX_TABS + 2}`);
    expect(s.closed.map((t) => t.path)).toEqual([0, 1, 2, 3].map(s1Path));
  });

  test('reopening at the cap keeps the tab it pushes out reopenable', () => {
    let s = syncPath(empty, home, g);
    for (let i = 0; i < MAX_TABS; i++) s = openTab(s, s1Path(i));
    const before = new Set(s.tabs.map((t) => t.path));
    s = reopenClosed(s);
    expect(s.tabs.length).toBe(MAX_TABS);
    const lost = [...before].filter((p) => !s.tabs.some((t) => t.path === p));
    expect(lost.length).toBe(1);
    expect(s.closed.map((t) => t.path)).toEqual(lost);
  });

  test('reopen restores a closed tab even when another tab shows the same page', () => {
    let s = syncPath(empty, home, g);
    s = openTab(s, home);
    s = openTab(s, s1);
    s = closeTab(s, s.tabs[1].id).state;
    s = reopenClosed(s);
    expect(paths(s)).toEqual([home, home, s1]);
    expect(s.activeId).toBe(s.tabs[1].id);
  });
});

describe('desktop tabs: pin and reorder', () => {
  test('pinned tabs stay first through a reorder', () => {
    let s = syncPath(empty, s1, g);
    s = openTab(s, s2);
    s = setPinned(s, s.tabs[1].id, true);
    expect(paths(s)).toEqual([s2, s1]);
    s = reorder(s, [s.tabs[1].id, s.tabs[0].id]);
    expect(paths(s)).toEqual([s2, s1]);
  });

  test('a new tab never lands inside the pinned group', () => {
    let s = syncPath(empty, s1, g);
    s = openTab(s, s2);
    s = setPinned(s, s.tabs[0].id, true);
    s = setPinned(s, s.tabs[1].id, true);
    s = { ...s, activeId: s.tabs[0].id };
    s = openTab(s, home);
    expect(paths(s)).toEqual([s1, s2, home]);
  });
});

describe('tabRoute', () => {
  test('maps project paths to tab kinds', () => {
    expect(tabRoute(home, P)).toEqual({ kind: 'home' });
    expect(tabRoute(s1, P)).toEqual({ kind: 'session', sessionId: 's1' });
    expect(tabRoute(models, P)).toEqual({ kind: 'admin', section: 'models' });
    expect(tabRoute(`/workspaces/${P}/admin/agents/sales%20bot`, P)).toEqual({
      kind: 'agent',
      name: 'sales bot',
    });
    expect(tabRoute(`/workspaces/${P}/artifacts/a1?v=2`, P)).toEqual({
      kind: 'artifact',
      artifactId: 'a1',
    });
    expect(tabRoute(`/workspaces/${P}/customize/review`, P)).toEqual({
      kind: 'customize',
      section: 'review',
    });
  });

  test('rejects anything that is not an app path of this project', () => {
    expect(tabRoute(`https://evil.example/workspaces/${P}`, P)).toBeNull();
    expect(tabRoute(`//evil.example/workspaces/${P}`, P)).toBeNull();
    expect(tabRoute(`javascript:alert(1)//workspaces/${P}`, P)).toBeNull();
    // Resolves elsewhere than it reads: a backslash, an encoded dot segment.
    expect(tabRoute(`/workspaces/${P}/sessions\\..\\..\\other`, P)).toBeNull();
    expect(tabRoute(`/workspaces/${P}/%2e%2e/other/sessions/s1`, P)).toBeNull();
    expect(tabRoute(`/workspaces/${P}/sessions/../../other/sessions/s1`, P)).toBeNull();
    // A raw newline would split a stored path into two.
    expect(tabRoute(`/workspaces/${P}/sessions/x\n//evil.example/a`, P)).toBeNull();
    expect(tabRoute(`/workspaces/${P}/sessions/x\t`, P)).toBeNull();
  });

  test('keeps paths with spaces and Unicode', () => {
    expect(tabRoute(`/workspaces/${P}/admin/agents/sales bot`, P)).toEqual({
      kind: 'agent',
      name: 'sales bot',
    });
    expect(tabRoute(`/workspaces/${P}/spaces/équipe`, P)).toEqual({
      kind: 'space',
      slug: 'équipe',
    });
  });

  test('the Apps page with an App open is that App', () => {
    expect(tabRoute(`/workspaces/${P}/apps?app=x1`, P)).toEqual({ kind: 'app', appId: 'x1' });
    expect(tabRoute(`/workspaces/${P}/apps`, P)).toEqual({ kind: 'page', page: 'apps' });
  });

  test('ignores paths outside the project', () => {
    expect(tabRoute('/workspaces/other/sessions/s1', P)).toBeNull();
    expect(tabRoute('/settings', P)).toBeNull();
    expect(tabRoute(`/workspaces/${P}/unknown`, P)).toBeNull();
  });
});

describe('ownEntry', () => {
  const icons = { models: 'cpu' };
  test('a section from the URL never resolves to an Object.prototype member', () => {
    expect(ownEntry(icons, 'models')).toBe('cpu');
    expect(ownEntry(icons, 'constructor')).toBeUndefined();
    expect(ownEntry(icons, 'toString')).toBeUndefined();
    expect(ownEntry(icons, '__proto__')).toBeUndefined();
    expect(ownEntry(icons, null)).toBeUndefined();
    expect(isPrototypeKey('constructor')).toBe(true);
    expect(isPrototypeKey('apiKeys')).toBe(false);
  });
});

describe('sanitizePersisted', () => {
  test('keeps well-formed tabs and drops anything malformed, so a bad blob cannot crash the shell', () => {
    const out = sanitizePersisted({
      byProject: {
        p1: {
          tabs: [
            { id: 'a', path: '/workspaces/p1' },
            { id: 'b', path: 42 },
            null,
            { id: 'c', path: '/workspaces/p1/goals', pinned: 'yes' },
          ],
          activeId: 'zzz',
          closed: 'nope',
        },
        p2: 'garbage',
        __proto__: { tabs: [] },
      },
    });
    expect(Object.keys(out.byProject)).toEqual(['p1']);
    expect(out.byProject.p1).toEqual({
      tabs: [
        { id: 'a', path: '/workspaces/p1' },
        { id: 'c', path: '/workspaces/p1/goals' },
      ],
      activeId: null,
      closed: [],
    });
  });

  test('anything that is not the stored shape becomes empty', () => {
    expect(sanitizePersisted(null)).toEqual({ byProject: {} });
    expect(sanitizePersisted({ byProject: [] })).toEqual({ byProject: {} });
  });
});
