import { createFilesStore, FilesStoreProvider } from '@kortix/ui/internal/stores/files-store';
import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';

const win = new Window({ url: 'http://localhost/workspaces/p/drive' });
// `bun test` runs every file in one process: put the globals back when this file ends.
const domKeys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'] as const;
const globalsBackup = domKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
Object.defineProperty(globalThis, 'window', { value: win, configurable: true });
Object.defineProperty(globalThis, 'document', { value: win.document, configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
afterAll(() => {
  for (const [key, descriptor] of globalsBackup) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

let search = new URLSearchParams();
const realNav = await import('next/navigation');
mock.module('next/navigation', () => ({ ...realNav, useSearchParams: () => search }));
const { createRoot } = await import('react-dom/client');
const { DrivePathInUrl } = await import('./files-view');

const PERSONAL = '/Users/you';
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
});

async function mount(store: ReturnType<typeof createFilesStore>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <FilesStoreProvider store={store}>
        <DrivePathInUrl personal={PERSONAL} />
      </FilesStoreProvider>,
    ),
  );
}

test('Drive opened with no ?path= stays on My desktop instead of jumping to the top', async () => {
  search = new URLSearchParams();
  const store = createFilesStore();
  store.setState({ currentPath: 'Users/you', rootPath: '/', expandedDirs: new Set() });
  await mount(store);
  expect(store.getState().currentPath).toBe('Users/you');
});

test('a ?path= that changes while Drive is open still moves the view', async () => {
  search = new URLSearchParams();
  const store = createFilesStore();
  store.setState({ currentPath: 'Users/you', rootPath: '/', expandedDirs: new Set() });
  await mount(store);
  search = new URLSearchParams('path=Company/Brand');
  await act(async () =>
    root?.render(
      <FilesStoreProvider store={store}>
        <DrivePathInUrl personal={PERSONAL} />
      </FilesStoreProvider>,
    ),
  );
  expect(store.getState().currentPath).toBe('Company/Brand');
});

test('a link back to Drive with no ?path= while a folder is open moves to the top, as the value means', async () => {
  search = new URLSearchParams('path=Company');
  const store = createFilesStore();
  store.setState({ currentPath: 'Company', rootPath: '/', expandedDirs: new Set() });
  await mount(store);
  search = new URLSearchParams();
  await act(async () =>
    root?.render(
      <FilesStoreProvider store={store}>
        <DrivePathInUrl personal={PERSONAL} />
      </FilesStoreProvider>,
    ),
  );
  expect(store.getState().currentPath).toBe('/');
});
