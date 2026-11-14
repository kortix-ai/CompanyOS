import type { DriveEntry } from '@kortix/sdk';
import { qk } from '@kortix/sdk/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';

const win = new Window({ url: 'http://localhost/workspaces/p/drive' });
// `bun test` runs every file in one process: put the globals back when this file ends.
const domKeys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'] as const;
const globalsBackup = domKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
Object.defineProperty(globalThis, 'document', { configurable: true, value: win.document });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
afterAll(() => {
  for (const [key, descriptor] of globalsBackup) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const { createRoot } = await import('react-dom/client');
const { DriveFilesProvider, driveExplorerSource } = await import('./drive-explorer-source');

const DRIVE = 'synthetic-drive';
const dir = (path: string): DriveEntry => ({ path, name: path.split('/').pop() ?? path, type: 'dir', size: 0, mtime: 0, access: 'manage' });
const listings: Record<string, DriveEntry[]> = {
  '/': [dir('/Company'), dir('/Marketing'), dir('/Users')],
  '/Users': [dir('/Users/you'), dir('/Users/ana.lima'), dir('/Users/ben.ortiz')],
  '/Users/ana.lima': [dir('/Users/ana.lima/Notes')],
};

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
});

/** The grid's entries for `path`, as the explorer source hands them to the All drives grid. */
async function grid(path: string, hideMemberDrives: boolean): Promise<string[]> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [p, entries] of Object.entries(listings)) client.setQueryData(qk.drives.files(DRIVE, p), { entries, access: 'manage' });
  let seen: string[] = [];
  function Probe() {
    seen = (driveExplorerSource.useFileList(path).data ?? []).map((n) => n.absolute ?? n.path);
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <DriveFilesProvider driveId={DRIVE} personalFolder="/Users/you" hideMemberDrives={hideMemberDrives}>
          <Probe />
        </DriveFilesProvider>
      </QueryClientProvider>,
    ),
  );
  return seen;
}

test('hidden: the All drives grid at / has no Users folder', async () => {
  expect(await grid('/', true)).toEqual(['/Company', '/Marketing']);
});

test('hidden: /Users lists only your own desktop', async () => {
  expect(await grid('/Users', true)).toEqual(['/Users/you']);
});

test("hidden: a member's folder opened by URL still lists what the API returns", async () => {
  expect(await grid('/Users/ana.lima', true)).toEqual(['/Users/ana.lima/Notes']);
});

test('shown (admin, setting on): every listing is as the API returns it', async () => {
  expect(await grid('/', false)).toEqual(['/Company', '/Marketing', '/Users']);
  expect(await grid('/Users', false)).toEqual(['/Users/you', '/Users/ana.lima', '/Users/ben.ortiz']);
});
