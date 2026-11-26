import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { App, Artifact } from '@kortix/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
// After the window exists: react-dom decides at load whether the DOM fires
// `input` events, and without them a typed search never reaches React.
const { createRoot } = await import('react-dom/client');

const artifact = (id: string, title: string, createdBy: string, pinned: boolean, visibility: 'project' | 'private'): Artifact => ({
  artifact_id: id, project_id: 'p1', title, description: null, type: 'doc', path: `/docs/${id}`, entry: 'index.md',
  visibility, shared_with_user_ids: [], pinned, created_by: { user_id: createdBy, name: createdBy, email: null, avatar_url: null },
  created_by_session_id: null, can_manage: true, view_url: `https://example.test/${id}`, web_url: `https://example.test/${id}/web`,
  public_url: null, public_content_url: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
});
const artifacts = [
  artifact('a-alpha', 'Alpha doc', 'user-1', false, 'project'),
  artifact('a-beta', 'Beta doc', 'user-2', true, 'private'),
];

// Apps are an artifact type (KRTX-5217). The gallery reads the project's App list, which the API
// already filters to the Apps the caller may open; `apps` is that list as the server returns it.
const app = (id: string, name: string, display: App['display'], http: 'admins' | 'app' = 'app'): App => ({
  app_id: id, account_id: 'acct-1', project_id: 'p1', slug: id, name, url: `https://${id}.apps.example.test`,
  access_mode: 'project', access_revision: 1, desired_state: 'running', active_deployment_id: null,
  machine: { cpu: 1, memory_gb: 1, disk_gb: 1 }, idle_timeout_seconds: 300, last_request_at: null, display,
  services: [{ name: 'http', protocol: 'http', access: http, internal_port: 8080, processes: ['web'], url: null }], viewer_can_access: true, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-03T00:00:00Z',
});
const ownerApps = [
  app('crm', 'CRM app', { listed: true }),
  // A tab of the CRM card and a background App: the Apps page shows neither as a card.
  app('crm-data', 'CRM data', { listed: true, parent: 'crm' }),
  app('poller', 'Poller', { listed: false }),
  app('ops', 'Ops console', { listed: true }, 'admins'),
  app('vault', 'Restricted app', { listed: true }),
];
let apps: App[] = ownerApps;
let canAdmin = true;
const sessionRequests: string[] = [];

let serverPlaceholder = false;
let serverConfirmed = false;
const realSdkReact = await import('@kortix/sdk/react');
mock.module('@kortix/sdk/react', () => ({
  ...realSdkReact,
  useArtifacts: (id: string | null, filter?: { q?: string }) =>
    id && filter?.q ? { data: serverPlaceholder ? [] : undefined, isLoading: !serverPlaceholder, isPlaceholderData: serverPlaceholder && !serverConfirmed, isError: false } : id ? { data: artifacts, isLoading: false, isError: false, refetch: async () => {} } : { data: undefined, isLoading: false, isError: false },
  useArtifactMutations: () => ({
    create: { mutateAsync: async () => ({ artifact_id: 'new' }), isPending: false },
    update: { mutate: () => {}, isPending: false },
    remove: { mutateAsync: async () => {}, isPending: false },
    pin: { mutate: () => {} },
  }),
  useProjectConfig: () => ({ data: null }),
  useWorkspaceApps: () => ({ data: apps, isLoading: false, isError: false }),
  useAppAccess: (_projectId: string, appId: string, options: { session?: boolean }) => {
    if (options.session) sessionRequests.push(appId);
    return { session: { data: undefined, isError: false } };
  },
  useCan: () => ({ allowed: canAdmin, isLoading: false }),
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
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/workspaces/p1/artifacts',
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

const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
const queryClient = new QueryClient();
const render = () => root.render(<QueryClientProvider client={queryClient}><ArtifactsGallery projectId="p1" /></QueryClientProvider>);

afterEach(async () => {
  apps = ownerApps;
  canAdmin = true;
  sessionRequests.length = 0;
  await act(async () => root.unmount());
  container.replaceChildren();
  root = createRoot(container);
});
const searchInput = () => {
  const node = document.body.querySelector('input');
  if (!(node instanceof HTMLInputElement)) throw new Error('missing the search input');
  return node;
};
const type = async (text: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!set) throw new Error('the value property has no setter');
    set.call(searchInput(), text);
    searchInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const cardLinks = () => [...document.body.querySelectorAll('a[href^="/workspaces/p1/artifacts/"]')];
const linkOf = (title: string) => {
  const link = cardLinks().find((a) => a.textContent === title);
  if (!link) throw new Error(`missing the card link: ${title}`);
  return link;
};
/** The hidden wrapper a filtered-out card sits in: still mounted, aria-hidden + fixed. */
const hiddenWrapperOf = (title: string) => linkOf(title).closest('div[aria-hidden="true"]');

test('a search filters which cards show without unmounting any card', async () => {
  await act(render);
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
  await act(render);
  const pinned: Element | undefined = [...document.body.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Pinned');
  if (!(pinned instanceof HTMLElement)) throw new Error('missing the Pinned tab');
  await act(() => pinned.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  expect(cardLinks().map((a) => a.textContent)).toEqual(['Alpha doc', 'Beta doc']);
  expect(hiddenWrapperOf('Alpha doc')).not.toBeNull();
  expect(hiddenWrapperOf('Beta doc')).toBeNull();
});

test('a cold server search at the page limit keeps existing previews mounted', async () => {
  const extras = Array.from({ length: 98 }, (_, i) => artifact(`extra-${i}`, `Extra ${i}`, 'user-1', false, 'private'));
  artifacts.push(...extras);
  try {
    await act(render);
    const previewLink = linkOf('Beta doc');
    await type('beta');
    expect(linkOf('Beta doc')).toBe(previewLink);
    expect(cardLinks()).toHaveLength(100);
    expect(hiddenWrapperOf('Alpha doc')).not.toBeNull();
    expect(hiddenWrapperOf('Beta doc')).toBeNull();
    await type('not-on-loaded-page');
    expect(linkOf('Beta doc')).toBe(previewLink);
    expect(cardLinks()).toHaveLength(100);
    expect(hiddenWrapperOf('Beta doc')).not.toBeNull();
    expect(document.querySelector('#artifact-gallery-panel [role="status"]')).not.toBeNull();
    serverPlaceholder = true;
    await type('warm-query-pending');
    expect(document.querySelector('#artifact-gallery-panel [role="status"]')).not.toBeNull();
    expect(container.textContent).not.toContain('No artifacts match');
    serverConfirmed = true;
    await type('confirmed-empty');
    expect(document.querySelector('#artifact-gallery-panel [role="status"]')).toBeNull();
    expect(container.textContent).toContain('No artifacts match');
  } finally { serverPlaceholder = false; serverConfirmed = false; artifacts.splice(2); }
});

const appLinks = () => [...document.body.querySelectorAll('a[href^="/workspaces/p1/apps?app="]')];
const appCard = (name: string) => appLinks().find((a) => a.textContent === name)?.closest('div[class*="group"]');

test('an App is listed as an App-type card that opens the App, beside the docs that keep their own link', async () => {
  await act(render);
  // One card per App the Apps page shows as a card: no card for its tab or its background App.
  expect(appLinks().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['CRM app', '/workspaces/p1/apps?app=crm'],
    ['Ops console', '/workspaces/p1/apps?app=ops'],
    ['Restricted app', '/workspaces/p1/apps?app=vault'],
  ]);
  expect(appCard('CRM app')?.textContent).toContain('App');
  // A doc keeps its artifact link and carries no App label.
  expect(linkOf('Alpha doc').getAttribute('href')).toBe('/workspaces/p1/artifacts/a-alpha');
  expect(linkOf('Alpha doc').closest('div[class*="group"]')?.textContent).not.toContain('App');
});

test('a viewer without access to an App gets no card for it and no access session for it', async () => {
  // The API's list for a teammate outside the restricted App's members omits it; a non-admin
  // also loses the admins-only App, as on the Apps page.
  apps = ownerApps.filter((item) => item.app_id !== 'vault');
  canAdmin = false;
  await act(render);
  expect(appLinks().map((a) => a.textContent)).toEqual(['CRM app']);
  expect(sessionRequests).not.toContain('vault');
  expect(sessionRequests).not.toContain('ops');
});

test('a search and the Pinned tab filter App cards like any artifact', async () => {
  await act(render);
  await type('crm');
  expect(appCard('CRM app')?.getAttribute('aria-hidden')).toBeNull();
  expect(appCard('Restricted app')?.getAttribute('aria-hidden')).toBe('true');
  await type('');
  const pinned = [...document.body.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'Pinned');
  if (!(pinned instanceof HTMLElement)) throw new Error('missing the Pinned tab');
  await act(() => pinned.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  expect(appCard('CRM app')?.getAttribute('aria-hidden')).toBe('true');
});
