/**
 * What a tab shows for a path: which kind of page it is and the id the title
 * resolver needs. Pure, so the strip and its tests agree on every route.
 *
 * Only paths inside the project the strip belongs to are tabs. A path in
 * another project or outside `/workspaces/<id>` returns null and the strip
 * ignores it.
 */
export type TabRoute =
  | { kind: 'home' }
  | { kind: 'session'; sessionId: string }
  | { kind: 'sessions' }
  | { kind: 'artifact'; artifactId: string }
  | { kind: 'artifacts' }
  | { kind: 'agent'; name: string }
  | { kind: 'admin'; section: string | null }
  | { kind: 'customize'; section: string | null }
  | { kind: 'goal'; goalId: string }
  | { kind: 'channel'; slug: string }
  | { kind: 'dm'; agent: string }
  | { kind: 'space'; slug: string }
  | { kind: 'settings' }
  | {
      kind: 'page';
      page:
        | 'apps'
        | 'chat'
        | 'drive'
        | 'files'
        | 'goals'
        | 'inbox'
        | 'memory'
        | 'members'
        | 'channels'
        | 'reminders';
    };

const PAGES = new Set([
  'apps',
  'chat',
  'drive',
  'files',
  'goals',
  'inbox',
  'memory',
  'members',
  'channels',
  'reminders',
]);

// A real app path is percent-encoded; a raw control character (a newline)
// only appears in a tampered stored value.
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The project-relative segments of `path`, or null when it is not in `projectId`. */
function projectSegments(path: string, projectId: string): string[] | null {
  // An app path only: `/workspaces/...`, never `//host` or `https://host`.
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const pathname = path.split(/[?#]/)[0] ?? '';
  // A path the browser would resolve somewhere else than the segments read
  // below: a backslash (a separator to the URL parser) or a dot segment,
  // plain or encoded (`..`, `%2e%2e`). Raw spaces and Unicode stay valid.
  if (pathname.includes('\\') || CONTROL_CHAR.test(path)) return null;
  if (pathname.split('/').some((segment) => DOT_SEGMENT.test(segment))) return null;
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'workspaces' && parts[0] !== 'projects') return null;
  if (parts[1] !== projectId) return null;
  return parts.slice(2);
}

export function tabRoute(path: string, projectId: string): TabRoute | null {
  const seg = projectSegments(path, projectId);
  if (!seg) return null;
  const [a, b, c] = seg;
  if (!a) return { kind: 'home' };
  switch (a) {
    case 'sessions':
      return b ? { kind: 'session', sessionId: b } : { kind: 'sessions' };
    case 'artifacts':
      return b ? { kind: 'artifact', artifactId: b } : { kind: 'artifacts' };
    case 'admin':
      if (b === 'agents' && c) return { kind: 'agent', name: decode(c) };
      return { kind: 'admin', section: b ?? null };
    case 'customize':
      return { kind: 'customize', section: b ?? null };
    case 'goals':
      return b ? { kind: 'goal', goalId: b } : { kind: 'page', page: 'goals' };
    case 'c':
      return b ? { kind: 'channel', slug: decode(b) } : { kind: 'page', page: 'chat' };
    case 'dm':
      return b ? { kind: 'dm', agent: decode(b) } : { kind: 'page', page: 'chat' };
    case 'spaces':
      return b ? { kind: 'space', slug: decode(b) } : { kind: 'home' };
    case 'settings':
      return { kind: 'settings' };
    default:
      if (PAGES.has(a))
        return { kind: 'page', page: a as Extract<TabRoute, { kind: 'page' }>['page'] };
      return null;
  }
}

/**
 * The destination a path belongs to, which decides the tab it opens in. Each
 * session is its own destination; every other page belongs to its section, so
 * moving inside a section (Customize → Triggers, Goals → one goal) stays in
 * one tab, and leaving it (a session → Goals) keeps the tab you left.
 */
export function tabGroup(route: TabRoute): string {
  switch (route.kind) {
    case 'home':
      return HOME_GROUP;
    case 'session':
      return `${SESSION_GROUP}${route.sessionId}`;
    case 'artifact':
    case 'artifacts':
      return 'artifacts';
    case 'agent':
    case 'admin':
    case 'customize':
    case 'settings':
      return 'customize';
    case 'goal':
      return 'goals';
    case 'channel':
    case 'dm':
      return 'chat';
    case 'space':
      return `space:${route.slug}`;
    case 'sessions':
      return 'sessions';
    case 'page':
      return route.page;
  }
}

/** The project's home: a blank New session, which the next destination replaces. */
export const HOME_GROUP = 'home';
const SESSION_GROUP = 'session:';

/** `tabGroup` for a path, or null when the path is not a page of the project. */
export function pathGroup(path: string, projectId: string): string | null {
  const route = tabRoute(path, projectId);
  return route ? tabGroup(route) : null;
}

/**
 * Whether the strip shows. A fresh start (one tab that is not a session) has
 * nothing to switch between, so the title bar stays as it was. A session open,
 * or a second tab, earns the strip. `currentPath` counts too: the window can
 * be on a session before the store has caught up, and reading it here keeps
 * the strip from appearing a frame late.
 */
export function stripVisible(
  tabs: readonly { path: string }[],
  currentPath: string,
  projectId: string,
): boolean {
  if (tabs.length > 1) return true;
  const isSession = (path: string) =>
    pathGroup(path, projectId)?.startsWith(SESSION_GROUP) ?? false;
  return isSession(currentPath) || tabs.some((tab) => isSession(tab.path));
}

/** The path a new tab opens on: the project's home, where a new session starts. */
export function newTabPath(projectId: string): string {
  return `/workspaces/${projectId}`;
}

/**
 * `map[key]` for the map's OWN keys only. A section comes from the URL, so a
 * plain lookup of `/admin/constructor` returned `Object.prototype.constructor`
 * and the strip rendered a function as an icon.
 */
export function ownEntry<V>(
  map: Readonly<Record<string, V>>,
  key: string | null | undefined,
): V | undefined {
  return key != null && Object.hasOwn(map, key) ? map[key] : undefined;
}

/** A key that is a property of every object (`constructor`, `toString`, `__proto__`, …). */
export function isPrototypeKey(key: string): boolean {
  return key in Object.prototype || key === '__proto__';
}
