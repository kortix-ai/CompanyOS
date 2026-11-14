import type { DriveEntry } from '@kortix/sdk';
import { createFilesStore, FilesStoreProvider } from '@kortix/ui/internal/stores/files-store';
import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';

const win = new Window({ url: 'http://localhost/workspaces/p/drive' });
// `bun test` runs every file in one process: put the globals back when this file ends.
const domKeys = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT'];
const globalsBackup = domKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
for (const key of domKeys) Object.defineProperty(globalThis, key, { configurable: true, value: Reflect.get(win, key) });
Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: win.getComputedStyle.bind(win) });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
afterAll(() => {
  for (const [key, descriptor] of globalsBackup) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function dir(path: string, name = path.split('/').pop() ?? path, access: DriveEntry['access'] = 'manage'): DriveEntry {
  return { path, name, type: 'dir', size: 0, mtime: 0, access };
}
// What the API answers today to an admin: every member's desktop under /Users.
const listings: Record<string, DriveEntry[]> = {
  '/': [dir('/Company'), dir('/Marketing'), dir('/Users')],
  '/Users': [dir('/Users/you', 'You'), dir('/Users/ana.lima', 'Ana Lima'), dir('/Users/ben.ortiz', 'Ben Ortiz')],
};
const files = await import('@kortix/ui/files');
mock.module('@kortix/ui/files', () => ({
  ...files,
  useDriveFolder: (_id: string | null, path: string) => ({
    data: { entries: listings[path] ?? [], access: 'manage' },
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    refetch: () => {},
  }),
}));
const { createRoot } = await import('react-dom/client');
const { DriveFolderTree, useDriveNav } = await import('./drive-folder-tree');
const { DriveJump } = await import('./files-view');
type DriveWithMemberAccess = import('./drive-places').DriveWithMemberAccess;

const base: DriveWithMemberAccess = {
  driveId: 'synthetic-drive',
  accountId: 'synthetic-account',
  projectId: 'synthetic-project',
  kind: 'project',
  name: 'Test drive',
  sizeBytes: 0,
  sizeLimitBytes: null,
  fileCount: 0,
  lastChangeAt: null,
  createdAt: '',
  updatedAt: '',
  access: 'manage',
  personalFolder: '/Users/you',
  sharedWithMe: [],
  sharedDrives: true,
};
const admin = (adminsOpenUserDrives?: boolean): DriveWithMemberAccess => ({ ...base, adminsOpenUserDrives });
const member = (adminsOpenUserDrives?: boolean): DriveWithMemberAccess => ({ ...base, access: 'none', adminsOpenUserDrives });

function Harness({ drive, mobile }: { drive: DriveWithMemberAccess; mobile: boolean }) {
  const nav = useDriveNav(drive);
  return mobile ? (
    <DriveJump drive={drive} nav={nav} onOpen={() => {}} />
  ) : (
    <DriveFolderTree drive={drive} nav={nav} path="/Users/you" onOpen={() => {}} />
  );
}

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
});

/** Everything the caller can read on the panel, or in the opened mobile menu. */
async function visibleText(drive: DriveWithMemberAccess, mobile: boolean): Promise<string> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <FilesStoreProvider store={createFilesStore()}>
        <Harness drive={drive} mobile={mobile} />
      </FilesStoreProvider>,
    ),
  );
  if (mobile) {
    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Folders"]');
    await act(async () => trigger?.click());
    if (!document.querySelector('[role="menu"]')) throw new Error('the mobile Drive menu did not open');
  }
  return document.body.textContent ?? '';
}

const NAMES = ['Ana Lima', 'Ben Ortiz'];

for (const mobile of [false, true]) {
  const surface = mobile ? 'mobile menu' : 'desktop panel';
  for (const [who, drive] of [
    ['admin, setting off', admin(false)],
    ['admin, setting absent (API before KRTX-4906)', admin(undefined)],
    ['member, setting off', member(false)],
    ['member, setting on', member(true)],
  ] as const) {
    test(`${surface} · ${who}: no member names, no member header`, async () => {
      const text = await visibleText(drive, mobile);
      expect(text).toContain('My desktop');
      expect(text).toContain('Company');
      for (const name of NAMES) expect(text).not.toContain(name);
      expect(text).not.toContain('Admin: member drives');
      expect(text).not.toContain('Members');
    });
  }

  test(`${surface} · admin, setting on: member desktops sit apart under "Admin: member drives"`, async () => {
    const text = await visibleText(admin(true), mobile);
    expect(text).toContain('Admin: member drives');
    for (const name of NAMES) expect(text).toContain(name);
    expect(text.indexOf('Admin: member drives')).toBeGreaterThan(text.indexOf('Marketing'));
    expect(text).not.toContain('You');
  });
}
