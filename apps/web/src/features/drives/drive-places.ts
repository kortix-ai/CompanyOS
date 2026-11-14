import type { DriveEntry } from '@kortix/sdk';

/** Holds every person's own folder (`/Users/<name>`): never a drive of its own. */
export const PEOPLE_ROOT = '/Users';
/** The drive the whole company works in; listed first. */
export const COMPANY_ROOT = '/Company';

/** A drive in the navigation: Company or a named team drive (Marketing, Sales…). */
export interface DrivePlace {
  path: string;
  name: string;
}

export const within = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);
const nameOf = (path: string) => path.split('/').filter(Boolean).pop() ?? path;

/**
 * The drives the caller opens, Company first, then by name: every top-level
 * folder they may open (People holds everyone's desktops and is never one),
 * and every shared Drive that reaches them through an agent and is not
 * inside one of those. A folder they only pass through on the way to a share
 * is not a drive of theirs.
 */
export function drivePlaces(root: readonly DriveEntry[], shared: readonly { path: string }[]): DrivePlace[] {
  const top = root
    .filter((e) => e.type === 'dir' && e.path !== PEOPLE_ROOT && !e.name.startsWith('.') && e.access !== 'none')
    .map((e) => ({ path: e.path, name: e.name }));
  const deeper = shared
    .filter((s) => !top.some((t) => within(s.path, t.path)))
    .map((s) => ({ path: s.path, name: nameOf(s.path) }));
  return [...top, ...deeper].sort(
    (a, b) => Number(b.path === COMPANY_ROOT) - Number(a.path === COMPANY_ROOT) || a.name.localeCompare(b.name),
  );
}

/** Where Drive navigation goes ({@link useDriveNav} in `drive-folder-tree.tsx`). */
export interface DriveNav {
  placesLoading: boolean;
  placesError: boolean;
  retryPlaces: () => void;
  places: DrivePlace[];
  members: DriveEntry[];
  personNames: ReadonlyMap<string, string>;
}
