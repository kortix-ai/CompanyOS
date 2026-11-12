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

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The project-relative segments of `path`, or null when it is not in `projectId`. */
function projectSegments(path: string, projectId: string): string[] | null {
  const pathname = path.split(/[?#]/)[0] ?? '';
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

/** The path a new tab opens on: the project's home, where a new session starts. */
export function newTabPath(projectId: string): string {
  return `/workspaces/${projectId}`;
}
