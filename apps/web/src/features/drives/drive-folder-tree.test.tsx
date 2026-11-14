import type { Drive, DriveEntry } from '@kortix/sdk';
import { createFilesStore, FilesStoreProvider } from '@kortix/ui/internal/stores/files-store';
import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';

const win = new Window();
Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
Object.defineProperty(globalThis, 'document', { value: win.document, configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
let entries: DriveEntry[] = [];
let status = { isLoading: false, isError: false, isSuccess: true, isFetching: false };
const { getFileIcon } =
  await import('../../../../../packages/ui/src/files/project/components/file-icon');
// Keep whatever the registry holds (the real barrel, or an earlier file's
// mock) and re-add this graph's stubs: bun freezes a mocked module's static
// export shape at the first `mock.module` in the process, so the first
// registrant must spread the real barrel for later graphs to link.
const files = await import('@kortix/ui/files');
mock.module('@kortix/ui/files', () => ({
  ...files,
  getFileIcon,
  useDriveFolder: () => ({ data: { entries }, ...status, refetch: () => {} }),
}));
const store = createFilesStore();
const { createRoot } = await import('react-dom/client');
const { DriveFolderTree } = await import('./drive-folder-tree');
type Nav = import('./drive-places').DriveNav;
const drive: Drive = {
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
  sharedDrives: true,
};
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  status = { isLoading: false, isError: false, isSuccess: true, isFetching: false };
  store.getState().goBackToBrowser();
});
function entry(name: string, type: DriveEntry['type']): DriveEntry {
  return { name, path: `/${name}`, type, size: 0, mtime: 0, access: 'manage' };
}
const opened: string[] = [];
const baseNav: Nav = {
  placesLoading: false,
  placesError: false,
  retryPlaces: () => {},
  places: [
    { path: '/Company', name: 'Company' },
    { path: '/Marketing', name: 'Marketing' },
  ],
  members: [],
  personNames: new Map(),
};
async function render(
  items: DriveEntry[],
  state = status,
  { path = '/Company', nav = baseNav, as = drive }: { path?: string; nav?: Nav; as?: Drive } = {},
) {
  status = state;
  entries = items;
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <FilesStoreProvider store={store}>
        <DriveFolderTree drive={as} nav={nav} path={path} onOpen={opened.push.bind(opened)} />
      </FilesStoreProvider>,
    ),
  );
}
/** The visible row names of a list, top to bottom (each folder or file's name button). */
const rowNames = (list: Element | null) =>
  Array.from(list?.querySelectorAll(':scope > li > div > button[title], :scope > li > button[title]') ?? [], (b) => b.getAttribute('title'));

test('My desktop sits apart, above Company and each team drive by name, with no generic heading', async () => {
  await render([]);
  const nav = document.querySelector('nav');
  expect(rowNames(nav?.querySelector('ul[aria-label="Personal"]') ?? null)).toEqual(['My desktop']);
  expect(rowNames(nav?.querySelector('ul[aria-label="Shared drives"]') ?? null)).toEqual(['Company', 'Marketing']);
  expect(nav?.textContent).not.toContain('All files');
  expect(nav?.querySelector('h2')).toBeNull();
});

test('other members\' desktops get their own labelled group only when the API lists them', async () => {
  const member: DriveEntry = { name: 'Ana Lima', path: '/Users/ana.lima', type: 'dir', size: 0, mtime: 0, access: 'manage' };
  await render([], status, { nav: { ...baseNav, members: [member] } });
  const heading = document.querySelector('nav h2');
  expect(heading?.textContent).toBe('Members');
  const group = document.querySelector(`section[aria-labelledby="${heading?.id}"] ul`);
  expect(rowNames(group)).toEqual(['Ana Lima']);
  expect(rowNames(document.querySelector('ul[aria-label="Shared drives"]'))).not.toContain('Ana Lima');
});

test('the drive in view is the current page and its folders show', async () => {
  await render([entry('Plans', 'dir')], status, { path: '/Company' });
  const company = document.querySelector('button[title="Company"]');
  expect(company?.getAttribute('aria-current')).toBe('page');
  expect(document.querySelector('button[title="Marketing"]')?.getAttribute('aria-current')).toBeNull();
  expect(document.querySelector('button[title="Plans"]')).not.toBeNull();
});

test('files-only folders render file children and keep their collapse control', async () => {
  await render([entry('notes.txt', 'file')]);
  expect(document.querySelector('button[title="notes.txt"]')).not.toBeNull();
  const collapse = document.querySelector<HTMLButtonElement>('button[aria-label="Folders in Company"]');
  expect(collapse?.getAttribute('aria-expanded')).toBe('true');
  await act(async () => collapse?.click());
  expect(collapse?.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('button[title="notes.txt"]')).toBeNull();
});

test('mixed folders show folders before alphabetically ordered visible files', async () => {
  await render([entry('z.txt', 'file'), entry('a.txt', 'file'), entry('Folder', 'dir'), entry('.hidden', 'file')]);
  const company = document.querySelector('button[title="Company"]')?.closest('li');
  expect(rowNames(company?.querySelector(':scope > ul') ?? null)).toEqual(['Folder', 'a.txt', 'z.txt']);
});

test('empty folders do not claim they can expand', async () => {
  await render([], status, { path: '/Users/you', nav: { ...baseNav, places: [] } });
  expect(document.querySelector('button[title="My desktop"]')?.getAttribute('aria-current')).toBe('page');
  expect(document.querySelector('button[aria-expanded]')).toBeNull();
});

test('selecting a file opens the shared preview with its sibling file list', async () => {
  await render([entry('a.txt', 'file'), entry('b.txt', 'file')]);
  const file = document.querySelector<HTMLButtonElement>('button[title="b.txt"]');
  await act(async () => file?.click());
  expect(store.getState().selectedFilePath).toBe('/b.txt');
  expect(store.getState().filePathList).toEqual(['/a.txt', '/b.txt']);
  expect(store.getState().currentFileIndex).toBe(1);
  expect(store.getState().view).toBe('viewer');
});

test('while the drives load they show placeholders, and a failed load offers a retry', async () => {
  await render([], status, { nav: { ...baseNav, places: [], placesLoading: true } });
  expect(document.querySelectorAll('ul[aria-label="Shared drives"] > li:not(:has(button))').length).toBe(2);
  expect(document.querySelector('button[title]')?.getAttribute('title')).toBe('My desktop');
  await act(async () => root?.unmount());
  let retried = 0;
  await render([], status, { nav: { ...baseNav, places: [], placesError: true, retryPlaces: () => (retried += 1) } });
  const retry = Array.from(document.querySelectorAll('ul[aria-label="Shared drives"] button')).find((b) => b.textContent === 'Try again');
  await act(async () => (retry as HTMLButtonElement | undefined)?.click());
  expect(retried).toBe(1);
});

for (const state of [
  { isLoading: true, isError: false, isSuccess: false, isFetching: true },
  { isLoading: false, isError: true, isSuccess: false, isFetching: false },
  { isLoading: false, isError: false, isSuccess: true, isFetching: true },
]) {
  test(`unknown or refreshing listings retain a folder chevron: ${JSON.stringify(state)}`, async () => {
    await render([], state);
    expect(document.querySelector('button[aria-label="Folders in Company"][aria-expanded="true"]')).not.toBeNull();
  });
}

test('an admin reaches All drives, the top where a new drive is made; a member does not', async () => {
  await render([], status, { path: '/' });
  const all = Array.from(document.querySelectorAll('ul[aria-label="Shared drives"] button')).find((b) => b.textContent === 'All drives');
  expect(all?.getAttribute('aria-current')).toBe('page');
  opened.length = 0;
  await act(async () => (all as HTMLButtonElement | undefined)?.click());
  expect(opened).toEqual(['/']);
  await act(async () => root?.unmount());
  await render([], status, { as: { ...drive, access: 'none' } });
  expect(document.querySelector('nav')?.textContent).not.toContain('All drives');
});
