/**
 * The missing-file gate on a drive-mount path.
 *
 * A path a session page reads under `/drives/…` whose file is gone from its
 * drive fails with 404 forever. The SDK's event stream invalidates every open
 * file query on each `file.edited` and at turn end, so one dead preview card
 * re-read the miss for as long as its session ran. These tests hold the
 * contract: the first read fails once; invalidations inside the suppress
 * window touch the file system again not at all; after the window they do; a
 * successful read clears the mark.
 */
import { ApiError } from '@kortix/sdk';
import { binaryBlobKeys, fileContentKeys } from '@kortix/sdk/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const blobReads: string[] = [];
const textReads: string[] = [];
/** `dead`: every read throws missing file; `alive`: it succeeds. */
const behavior = new Map<string, 'dead' | 'alive'>();

mock.module('../../../internal/files/runtime-files', () => ({
  readFile: async (path: string) => {
    textReads.push(path);
    if (behavior.get(path) === 'dead') throw new ApiError('File or folder not found', { status: 404, code: 'not_found' });
    return { type: 'text' as const, content: 'ok' };
  },
  readFileAsBlob: async (path: string) => {
    blobReads.push(path);
    if (behavior.get(path) === 'dead') throw new ApiError('File or folder not found', { status: 404, code: 'not_found' });
    return new Blob([new Uint8Array([1])], { type: 'application/octet-stream' });
  },
}));
mock.module('./use-server-health', () => ({
  useServerHealth: () => ({ parked: false }),
  useCurrentProject: () => ({}),
}));

const { setMissingFileClockForTests, clearMissingFileReadsForTests } = await import(
  '../../../internal/files/file-read-retry'
);
const { useFileContent } = await import('./use-file-content');
const { useBinaryBlob } = await import('./use-binary-blob');

/** `date` moves for the registry so a test never waits on the real clock. */
let date = 1_000_000;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let queryClient: QueryClient;
const roots: ReactTestRenderer[] = [];
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;

beforeEach(() => {
  behavior.clear();
  blobReads.length = 0;
  textReads.length = 0;
  date = 1_000_000;
  setMissingFileClockForTests(() => date);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  win = new Window();
  const globals: Record<string, unknown> = {
    window: win,
    document: win.document,
    navigator: win.navigator,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    MutationObserver: win.MutationObserver,
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
});

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  queryClient.clear();
  await win.happyDOM.abort();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  saved.clear();
  clearMissingFileReadsForTests();
});

async function settle() {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function mount(node: ReactNode) {
  let root: ReactTestRenderer | undefined;
  await act(async () => {
    root = create(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  });
  roots.push(root!);
  await settle();
  return root!;
}

async function invalidateAll(reason: 'blob' | 'content') {
  await act(async () => {
    queryClient.invalidateQueries({ queryKey: reason === 'blob' ? binaryBlobKeys.all : fileContentKeys.all, type: 'active' });
  });
  await settle();
}

let blobState: { error: string | null; blob: Blob | null; isLoading: boolean } | undefined;
function BinaryProbe({ path, onState }: { path: string; onState: (state: { error: string | null; blob: Blob | null; isLoading: boolean }) => void }) {
  const q = useBinaryBlob(path);
  onState({ error: q.error, blob: q.blob, isLoading: q.isLoading });
  return null;
}

let contentError: unknown;
function ContentProbe({ path, onError }: { path: string; onError: (state: unknown) => void }) {
  const q = useFileContent(path);
  onError(q.error);
  return null;
}

const DEAD = '/drives/me/dead.png';
const DEAD_TEXT = '/drives/me/dead.txt';

test('a missing drive file is read once; turn-end refetches stay silent in the window; a later one reads again', async () => {
  behavior.set(DEAD, 'dead');
  await mount(<BinaryProbe path={DEAD} onState={(s) => (blobState = s)} />);
  expect(blobReads).toEqual([DEAD]);
  expect(blobState?.error).toBe('File or folder not found');

  // The SDK invalidates every open blob query at each file write and turn
  // end. Inside the window none of it may reach the file system.
  await invalidateAll('blob');
  await invalidateAll('blob');
  expect(blobReads).toEqual([DEAD]);
  expect(blobState?.error).toBe('File or folder not found');

  // After the window the next invalidation reads again (the file may be back).
  await act(async () => { date += 5 * 60_000 + 1; });
  await invalidateAll('blob');
  expect(blobReads).toEqual([DEAD, DEAD]);
});

test('a missing text file is read once; touch-again events re-read nothing until the window passes', async () => {
  behavior.set(DEAD_TEXT, 'dead');
  await mount(<ContentProbe path={DEAD_TEXT} onError={(s) => (contentError = s)} />);
  expect(textReads).toEqual([DEAD_TEXT]);

  await invalidateAll('content');
  expect(textReads).toEqual([DEAD_TEXT]);

  await act(async () => { date += 5 * 60_000 + 1; });
  await invalidateAll('content');
  expect(textReads).toEqual([DEAD_TEXT, DEAD_TEXT]);
});

test('a read that finds the file clears the mark, so later refetches read again', async () => {
  behavior.set(DEAD, 'dead');
  await mount(<BinaryProbe path={DEAD} onState={(s) => (blobState = s)} />);
  expect(blobReads).toEqual([DEAD]);

  await act(async () => { date += 5 * 60_000 + 1; });
  behavior.set(DEAD, 'alive');
  await invalidateAll('blob');
  expect(blobReads).toEqual([DEAD, DEAD]);
  expect(blobState?.blob).not.toBeNull();

  // Alive again: every next invalidation reads through, it does not rest on the mark.
  await invalidateAll('blob');
  expect(blobReads).toEqual([DEAD, DEAD, DEAD]);
});
