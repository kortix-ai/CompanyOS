import { configureKortix } from '@kortix/sdk';
import { qk } from '@kortix/sdk/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, jest, mock, test } from 'bun:test';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

/**
 * The access gate's data lifecycle, observed from outside: the requests it
 * sends and the screen it renders. Synthetic ids only.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let auth: { user: { id: string } | null; isLoading: boolean } = { user: null, isLoading: true };
let signedOutRedirects = 0;
mock.module('@/features/providers/auth-provider', () => ({ useAuth: () => auth }));
mock.module('@/lib/auth/use-signed-out-redirect', () => ({
  useSignedOutRedirect: () => {
    signedOutRedirects += 1;
  },
}));
mock.module('@kortix/ui/internal/hooks/admin/use-admin-role', () => ({ useAdminRole: () => ({ data: null }) }));
mock.module('@kortix/ui/internal/lib/onboarding/use-app-home', () => ({ useAppHome: () => '/' }));
mock.module('next/navigation', () => ({
  usePathname: () => '/workspaces/synthetic-project',
  useParams: () => ({}),
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));
mock.module('@/i18n/use-translations', () => ({
  useLocale: () => 'en',
  useTranslations: () =>
    Object.assign((key: string) => key, { raw: (key: string) => key, rich: (key: string) => key }),
}));
const { ProjectAccessBoundary } = await import('./project-access-boundary');

const PROJECT = 'synthetic-project';
const SUMMARY = `http://api.test/v1/workspaces/${PROJECT}`;
const PROJECT_ROW = {
  project_id: PROJECT,
  account_id: 'synthetic-account',
  name: 'Synthetic',
  repo_url: '',
  default_branch: 'main',
  role: 'owner',
};

type Reply = () => Response | Promise<Response>;
let summary: Reply;
let accessRequest: Reply;
let restore: Reply;
let calls: { method: string; url: string }[];
let tree: ReactTestRenderer | undefined;
let client: QueryClient;

const status = (code: number) => () => Response.json({ message: `status ${code}` }, { status: code });
const summaryGets = () => calls.filter((call) => call.method === 'GET' && call.url === SUMMARY).length;
const accessRequestResult = (result: string) => () =>
  Response.json(
    result === 'already_has_access'
      ? { status: result, project_id: PROJECT }
      : { status: result, request: { request_id: 'synthetic-request', status: 'pending' } },
  );

beforeEach(() => {
  auth = { user: { id: 'synthetic-user-a' }, isLoading: false };
  calls = [];
  summary = status(403);
  accessRequest = accessRequestResult('created');
  restore = () => Response.json({ ...PROJECT_ROW, state: 'active' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000 } } });
  jest.useFakeTimers();
  configureKortix({
    backendUrl: 'http://api.test/v1',
    getToken: async () => 'synthetic-token',
    fetch: async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      calls.push({ method, url });
      if (url === SUMMARY) return summary();
      if (url === `${SUMMARY}/access-requests`) return accessRequest();
      if (url === `${SUMMARY}/restore`) return restore();
      return Response.json({});
    },
  });
});

afterEach(async () => {
  if (tree) await act(async () => tree?.unmount());
  tree = undefined;
  client.clear();
  jest.useRealTimers();
});

const boundary = () => (
  <QueryClientProvider client={client}>
    <ProjectAccessBoundary projectId={PROJECT}>PROJECT CONTENT</ProjectAccessBoundary>
  </QueryClientProvider>
);

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

async function mount() {
  await act(async () => {
    tree = create(boundary());
  });
  await advance(100);
}

function textOf(node: ReactTestInstance | string): string {
  return typeof node === 'string' ? node : node.children.map(textOf).join('');
}

const screen = () => JSON.stringify(tree?.toJSON());

function button(label: string): ReactTestInstance {
  const found = tree?.root.findAll((node) => node.type === 'button' && textOf(node).includes(label));
  if (!found?.length) throw new Error(`no button labelled ${label}`);
  return found[0];
}

async function submitRequest() {
  await act(async () => {
    tree?.root.findByType('form').props.onSubmit({ preventDefault: () => {} });
  });
  await advance(100);
}

test('unresolved auth shows the pending frame and sends no access read', async () => {
  auth = { user: null, isLoading: true };
  signedOutRedirects = 0;
  await mount();
  expect(signedOutRedirects).toBeGreaterThan(0);
  expect(calls).toHaveLength(0);
  expect(screen()).not.toContain('projectAccessBoundary.');
  expect(screen()).not.toContain('PROJECT CONTENT');

  auth = { user: { id: 'synthetic-user-a' }, isLoading: false };
  await act(async () => tree?.update(boundary()));
  await advance(100);
  expect(summaryGets()).toBe(1);
  expect(screen()).toContain('projectAccessBoundary.privateHeading');
});

test('a created request shows the sent screen and polls every 15 s', async () => {
  await mount();
  expect(screen()).toContain('projectAccessBoundary.privateHeading');
  await submitRequest();
  expect(calls.filter((call) => call.method === 'POST')).toEqual([
    { method: 'POST', url: `${SUMMARY}/access-requests` },
  ]);
  expect(screen()).toContain('projectAccessBoundary.waitingHeading');
  expect(screen()).toContain('projectAccessBoundary.sentBody');
  expect(summaryGets()).toBe(1);
  await advance(14_000);
  expect(summaryGets()).toBe(1);
  await advance(1_000);
  expect(summaryGets()).toBe(2);
  await advance(15_000);
  expect(summaryGets()).toBe(3);
});

test('a pending request shows the already-requested screen', async () => {
  accessRequest = accessRequestResult('pending');
  await mount();
  await submitRequest();
  expect(screen()).toContain('projectAccessBoundary.waitingHeading');
  expect(screen()).toContain('projectAccessBoundary.alreadyBody');
});

test('already_has_access re-reads the project and opens it', async () => {
  accessRequest = accessRequestResult('already_has_access');
  await mount();
  summary = () => Response.json(PROJECT_ROW);
  await submitRequest();
  expect(summaryGets()).toBe(2);
  expect(screen()).toContain('PROJECT CONTENT');
});

test('a transient failure while waiting keeps the waiting screen', async () => {
  await mount();
  await submitRequest();
  summary = status(500);
  await advance(15_000);
  expect(summaryGets()).toBe(2);
  expect(screen()).toContain('projectAccessBoundary.sentBody');
  expect(screen()).not.toContain('projectAccessBoundary.errorHeading');
});

test('a project deleted while waiting shows not-found and stops polling', async () => {
  await mount();
  await submitRequest();
  summary = status(404);
  await advance(15_000);
  expect(summaryGets()).toBe(2);
  expect(screen()).toContain('projectAccessBoundary.notFoundHeading');
  for (let poll = 0; poll < 4; poll += 1) await advance(15_000);
  expect(summaryGets()).toBe(2);
});

test('approval opens the project and stops polling', async () => {
  await mount();
  await submitRequest();
  summary = () => Response.json(PROJECT_ROW);
  await advance(15_000);
  expect(summaryGets()).toBe(2);
  expect(screen()).toContain('PROJECT CONTENT');
  expect(calls.some((call) => call.url === `${SUMMARY}/detail`)).toBe(true);
  for (let poll = 0; poll < 4; poll += 1) await advance(15_000);
  expect(summaryGets()).toBe(2);
});

test('the check-now button is pending only for its own press, never for a background poll', async () => {
  // A kept project that turned 403: the gate holds data, so a refetch keeps
  // the gate on screen instead of the pending frame.
  client.setQueryData(qk.project.summary(PROJECT), PROJECT_ROW);
  await mount();
  expect(screen()).toContain('projectAccessBoundary.privateHeading');
  await submitRequest();
  let release = () => {};
  summary = () =>
    new Promise<Response>((resolve) => {
      release = () => resolve(Response.json({ message: 'Forbidden' }, { status: 403 }));
    });
  await advance(15_000);
  expect(summaryGets()).toBe(2);
  expect(button('projectAccessBoundary.checkNowAction').props.disabled).toBe(false);
  release();
  await advance(0);

  await act(async () => button('projectAccessBoundary.checkNowAction').props.onClick());
  expect(summaryGets()).toBe(3);
  expect(button('projectAccessBoundary.checkNowAction').props.disabled).toBe(true);
  release();
  await advance(0);
  expect(button('projectAccessBoundary.checkNowAction').props.disabled).toBe(false);
  expect(screen()).toContain('projectAccessBoundary.sentBody');
});

test('a different signed-in user starts from a fresh gate, with no inherited waiting state', async () => {
  await mount();
  await submitRequest();
  expect(screen()).toContain('projectAccessBoundary.waitingHeading');
  auth = { user: { id: 'synthetic-user-b' }, isLoading: false };
  await act(async () => tree?.update(boundary()));
  await advance(100);
  expect(summaryGets()).toBe(2);
  expect(screen()).toContain('projectAccessBoundary.privateHeading');
  expect(screen()).not.toContain('projectAccessBoundary.waitingHeading');
  for (let poll = 0; poll < 3; poll += 1) await advance(15_000);
  expect(summaryGets()).toBe(2);
});

test('restoring a deleting workspace re-reads it and opens the project', async () => {
  summary = () => Response.json({ ...PROJECT_ROW, state: 'deleting', deletion_scheduled_for: '2026-12-01T00:00:00.000Z' });
  await mount();
  expect(screen()).not.toContain('PROJECT CONTENT');
  summary = () => Response.json({ ...PROJECT_ROW, state: 'active' });
  await act(async () => button('restore').props.onClick());
  await advance(100);
  expect(calls.filter((call) => call.method === 'POST')).toEqual([{ method: 'POST', url: `${SUMMARY}/restore` }]);
  expect(summaryGets()).toBe(2);
  expect(screen()).toContain('PROJECT CONTENT');
});
