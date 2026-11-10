import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { Container, Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Artifact } from '@kortix/sdk';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
const win = new Window({ url: 'http://localhost/workspaces/p1/artifacts' });
const globals = globalThis as Record<string, unknown>;
globals.window = win;
globals.document = win.document;
globals.navigator = win.navigator;
globals.location = win.location;
globals.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
globals.cancelAnimationFrame = (id: number) => clearTimeout(id);
globals.getComputedStyle = win.getComputedStyle.bind(win);
globals.customElements = win.customElements;
for (const key of Object.getOwnPropertyNames(win)) {
  if (/^[A-Z]/.test(key) && (!(key in globals) || key.endsWith('Event'))) {
    globals[key] = Reflect.get(win, key);
  }
}
const { createRoot } = await import('react-dom/client');

const artifacts = [
  { artifact_id: 'a-alpha', title: 'Alpha doc', description: null, created_by: { user_id: 'user-1' }, pinned: false, visibility: 'project', view_url: 'https://example.test/alpha', updated_at: '2026-11-01T00:00:00Z', type: 'doc' },
  { artifact_id: 'a-beta', title: 'Beta doc', description: null, created_by: { user_id: 'user-2' }, pinned: true, visibility: 'private', view_url: 'https://example.test/beta', updated_at: '2026-11-02T00:00:00Z', type: 'doc' },
] as unknown as Artifact[];

const realSdkReact = await import('@kortix/sdk/react');
mock.module('@kortix/sdk/react', () => ({
  ...realSdkReact,
  useArtifacts: (id: string | null) =>
    id ? { data: artifacts, isLoading: false, isError: false, refetch: async () => {} } : { data: undefined, isLoading: false, isError: false },
  useArtifactMutations: () => ({
    create: { mutateAsync: async () => ({ artifact_id: 'new' }), isPending: false },
    update: { mutate: () => {}, isPending: false },
    remove: { mutateAsync: async () => {}, isPending: false },
    pin: { mutate: () => {} },
  }),
  useProjectConfig: () => ({ data: null }),
  useFeatureFlag: () => ({ enabled: false }),
  prefetchArtifact: () => Promise.resolve(),
}));
const realAuth = await import('@/features/providers/auth-provider');
mock.module('@/features/providers/auth-provider', () => ({
  ...realAuth,
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
const realNav = await import('next/navigation');
mock.module('next/navigation', () => ({
  ...realNav,
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
}));
const realUiProvider = { ...(await import('@kortix/ui/providers/ui-provider')) };
mock.module('@kortix/ui/providers/ui-provider', () => ({
  ...realUiProvider,
  useUiSearchParams: () => new URLSearchParams(''),
  useUiPathname: () => '/workspaces/p1/artifacts',
  useUiRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  useUiViewerId: () => 'user-1',
}));
const { ArtifactsGallery } = await import('./artifacts-gallery');

const container = win.document.createElement('div');
win.document.body.append(container);
let root: Root = createRoot(container as unknown as Container);
const queryClient = new QueryClient();

afterEach(async () => {
  await act(async () => root.unmount());
  container.replaceChildren();
  root = createRoot(container as unknown as Container);
});
const searchInput = () => {
  const node = win.document.body.querySelector('input');
  if (!(node instanceof win.HTMLInputElement)) throw new Error('missing the search input');
  return node;
};
const type = async (text: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
    set.call(searchInput(), text);
    searchInput().dispatchEvent(new win.Event('input', { bubbles: true }));
  });
};
const cardLinks = () => [...win.document.body.querySelectorAll('a[href^="/workspaces/p1/artifacts/"]')];
const hiddenWrapperOf = (title: string) =>
  cardLinks().find((a) => a.textContent === title)!.closest('div[aria-hidden="true"]');

test('a search filters which cards show without unmounting any card', async () => {
  await act(async () => root.render(<QueryClientProvider client={queryClient}><ArtifactsGallery projectId="p1" /></QueryClientProvider>));
  expect(cardLinks().map((a) => a.textContent)).toEqual(['Alpha doc', 'Beta doc']);
  await type('beta');
  // Both cards stay mounted; the filtered-out one goes aria-hidden + inert.
  expect(cardLinks().map((a) => a.textContent)).toEqual(['Alpha doc', 'Beta doc']);
  expect(hiddenWrapperOf('Alpha doc')).not.toBeNull();
  expect(hiddenWrapperOf('Beta doc')).toBeNull();
  await type('');
  expect(hiddenWrapperOf('Alpha doc')).toBeNull();
});

test('the Pinned scope tab keeps the same cards mounted and hides the unpinned one', async () => {
  await act(async () => root.render(<QueryClientProvider client={queryClient}><ArtifactsGallery projectId="p1" /></QueryClientProvider>));
  const pinned = [...win.document.body.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Pinned');
  if (!pinned) throw new Error('missing the Pinned tab');
  await act(() => pinned.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0 }) as never));
  expect(cardLinks().map((a) => a.textContent)).toEqual(['Alpha doc', 'Beta doc']);
  expect(hiddenWrapperOf('Alpha doc')).not.toBeNull();
  expect(hiddenWrapperOf('Beta doc')).toBeNull();
});
