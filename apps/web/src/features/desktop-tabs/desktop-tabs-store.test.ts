import { describe, expect, test } from 'bun:test';

import {
  closeOthers,
  closeTab,
  closeToRight,
  MAX_TABS,
  openTab,
  reopenClosed,
  reorder,
  setPinned,
  syncPath,
  type ProjectTabs,
} from './desktop-tabs-store';
import { tabRoute } from './tab-route';

const P = 'project-1';
const home = `/workspaces/${P}`;
const s1 = `/workspaces/${P}/sessions/s1`;
const s2 = `/workspaces/${P}/sessions/s2`;
const models = `/workspaces/${P}/admin/models`;

const empty: ProjectTabs = { tabs: [], activeId: null, closed: [] };
const s1Path = (i: number) => `${home}/sessions/x${i}`;
const paths = (s: ProjectTabs) => s.tabs.map((t) => t.path);
const activePath = (s: ProjectTabs) => s.tabs.find((t) => t.id === s.activeId)?.path;

describe('desktop tabs: navigation', () => {
  test('the first navigation opens the first tab', () => {
    const s = syncPath(empty, s1);
    expect(paths(s)).toEqual([s1]);
    expect(activePath(s)).toBe(s1);
  });

  test('navigating moves the active tab instead of opening another', () => {
    const s = syncPath(syncPath(empty, s1), models);
    expect(paths(s)).toEqual([models]);
  });

  test('navigating to a path another tab holds focuses that tab', () => {
    let s = syncPath(empty, s1);
    s = openTab(s, s2);
    s = syncPath(s, s1);
    expect(paths(s)).toEqual([s1, s2]);
    expect(activePath(s)).toBe(s1);
  });

  test('the same path twice is a no-op (same object)', () => {
    const s = syncPath(empty, s1);
    expect(syncPath(s, s1)).toBe(s);
  });
});

describe('desktop tabs: open and close', () => {
  test('a new tab opens right of the active one and takes focus', () => {
    let s = syncPath(empty, s1);
    s = openTab(s, s2);
    s = { ...s, activeId: s.tabs[0].id };
    s = openTab(s, home);
    expect(paths(s)).toEqual([s1, home, s2]);
    expect(activePath(s)).toBe(home);
  });

  test('closing the active tab focuses the right neighbour, then the left', () => {
    let s = syncPath(empty, s1);
    s = openTab(s, s2);
    s = openTab(s, models);
    s = { ...s, activeId: s.tabs[1].id };
    const a = closeTab(s, s.tabs[1].id);
    expect(a.navigateTo).toBe(models);
    const b = closeTab(a.state, a.state.activeId!);
    expect(b.navigateTo).toBe(s1);
  });

  test('closing a background tab does not navigate', () => {
    let s = syncPath(empty, s1);
    s = openTab(s, s2);
    const r = closeTab(s, s.tabs[0].id);
    expect(r.navigateTo).toBeNull();
    expect(paths(r.state)).toEqual([s2]);
  });

  test('reopen brings the last closed tab back to its place and focuses it', () => {
    let s = syncPath(empty, s1);
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
    let s = syncPath(empty, home);
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
    let s = syncPath(empty, home);
    s = setPinned(s, s.tabs[0].id, true);
    for (let i = 0; i < MAX_TABS + 3; i++) s = openTab(s, `${home}/sessions/x${i}`);
    expect(s.tabs.length).toBe(MAX_TABS);
    expect(s.tabs[0].path).toBe(home);
    expect(activePath(s)).toBe(`${home}/sessions/x${MAX_TABS + 2}`);
    expect(s.closed.map((t) => t.path)).toEqual([0, 1, 2, 3].map(s1Path));
  });

  test('reopening at the cap keeps the tab it pushes out reopenable', () => {
    let s = syncPath(empty, home);
    for (let i = 0; i < MAX_TABS; i++) s = openTab(s, s1Path(i));
    const before = new Set(s.tabs.map((t) => t.path));
    s = reopenClosed(s);
    expect(s.tabs.length).toBe(MAX_TABS);
    const lost = [...before].filter((p) => !s.tabs.some((t) => t.path === p));
    expect(lost.length).toBe(1);
    expect(s.closed.map((t) => t.path)).toEqual(lost);
  });

  test('reopen restores a closed tab even when another tab shows the same page', () => {
    let s = syncPath(empty, home);
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
    let s = syncPath(empty, s1);
    s = openTab(s, s2);
    s = setPinned(s, s.tabs[1].id, true);
    expect(paths(s)).toEqual([s2, s1]);
    s = reorder(s, [s.tabs[1].id, s.tabs[0].id]);
    expect(paths(s)).toEqual([s2, s1]);
  });

  test('a new tab never lands inside the pinned group', () => {
    let s = syncPath(empty, s1);
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
  });

  test('ignores paths outside the project', () => {
    expect(tabRoute('/workspaces/other/sessions/s1', P)).toBeNull();
    expect(tabRoute('/settings', P)).toBeNull();
    expect(tabRoute(`/workspaces/${P}/unknown`, P)).toBeNull();
  });
});
