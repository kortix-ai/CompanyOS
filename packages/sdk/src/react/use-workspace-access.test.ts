import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { configureKortix } from '../core/http/config';
import { qk } from './query-keys';
import {
  errorStatus,
  useRestoreWorkspace,
  useWorkspaceAccess,
  workspaceAccessQueryOptions,
  type WorkspaceAccess,
} from './use-workspace-access';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ID = 'synthetic-workspace';
const SUMMARY = `http://api.test/v1/workspaces/${ID}`;
const ROW = { project_id: ID, account_id: 'synthetic-account', name: 'Synthetic', role: 'owner' };

let summary: () => Response | Promise<Response>;
let accessResult: Record<string, unknown>;
let calls: { method: string; url: string }[];
let client: QueryClient;
let tree: ReactTestRenderer | undefined;

const status = (code: number) => () => Response.json({ message: `status ${code}` }, { status: code });
const summaryGets = () => calls.filter((call) => call.method === 'GET' && call.url === SUMMARY).length;

beforeEach(() => {
  calls = [];
  summary = status(403);
  accessResult = { status: 'created', request: { request_id: 'r' } };
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
      if (url === `${SUMMARY}/access-requests`) return Response.json(accessResult);
      if (url === `${SUMMARY}/restore`) return Response.json({ ...ROW, state: 'active' });
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

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

async function renderAccess(authReady: boolean): Promise<() => WorkspaceAccess> {
  let access: WorkspaceAccess | undefined;
  function Probe() {
    access = useWorkspaceAccess(ID, { authReady });
    // TanStack re-renders only for the result fields a render reads.
    const { status, error, isSuccess } = access.query;
    return `${status}:${errorStatus(error) ?? ''}:${isSuccess}:${access.rechecking}`;
  }
  await act(async () => {
    tree = create(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));
  });
  await advance(100);
  return () => {
    if (!access) throw new Error('not rendered');
    return access;
  };
}

test('errorStatus reads the status off both SDK error shapes', () => {
  expect(errorStatus({ status: 404 })).toBe(404);
  expect(errorStatus({ response: { status: 403 } })).toBe(403);
  expect(errorStatus(new Error('offline'))).toBeUndefined();
  expect(errorStatus(null)).toBeUndefined();
});

test('the access read uses the canonical summary slot, without retries', () => {
  expect(workspaceAccessQueryOptions(ID).queryKey).toEqual(qk.project.summary(ID));
  expect(workspaceAccessQueryOptions(ID).retry).toBe(false);
});

test('no read before auth is ready', async () => {
  const access = await renderAccess(false);
  expect(calls).toHaveLength(0);
  expect(access().query.isPending).toBe(true);
});

test('a sent request waits and polls every 15 s until access lands', async () => {
  const access = await renderAccess(true);
  expect(errorStatus(access().query.error)).toBe(403);
  expect(access().waiting).toBeNull();
  await act(async () => {
    await access().request.mutateAsync('please');
  });
  expect(access().waiting).toBe('created');
  await advance(15_000);
  expect(summaryGets()).toBe(2);
  summary = () => Response.json(ROW);
  await advance(15_000);
  expect(summaryGets()).toBe(3);
  expect(access().query.isSuccess).toBe(true);
  for (let poll = 0; poll < 4; poll += 1) await advance(15_000);
  expect(summaryGets()).toBe(3);
});

test('already_has_access re-reads the access answer instead of waiting', async () => {
  const access = await renderAccess(true);
  accessResult = { status: 'already_has_access', project_id: ID };
  summary = () => Response.json(ROW);
  await act(async () => {
    await access().request.mutateAsync('');
  });
  await advance(0);
  expect(access().waiting).toBeNull();
  expect(summaryGets()).toBe(2);
  expect(access().query.isSuccess).toBe(true);
});

test('a gone answer while waiting stops the poll', async () => {
  const access = await renderAccess(true);
  await act(async () => {
    await access().request.mutateAsync('');
  });
  summary = status(404);
  await advance(15_000);
  expect(summaryGets()).toBe(2);
  for (let poll = 0; poll < 4; poll += 1) await advance(15_000);
  expect(summaryGets()).toBe(2);
});

test('recheckNow is pending for its own read only, never for the background poll', async () => {
  const access = await renderAccess(true);
  await act(async () => {
    await access().request.mutateAsync('');
  });
  let release = () => {};
  summary = () =>
    new Promise<Response>((resolve) => {
      release = () => resolve(Response.json({ message: 'Forbidden' }, { status: 403 }));
    });
  await advance(15_000);
  expect(summaryGets()).toBe(2);
  expect(access().rechecking).toBe(false);
  release();
  await advance(0);

  await act(async () => access().recheckNow());
  await advance(0);
  expect(summaryGets()).toBe(3);
  expect(access().rechecking).toBe(true);
  release();
  await advance(0);
  expect(access().rechecking).toBe(false);
});

test('restore refreshes the workspace lists and re-reads the access answer', async () => {
  summary = () => Response.json({ ...ROW, state: 'deleting' });
  await renderAccess(true);
  const listKey = qk.projects.workspaces('synthetic-user');
  client.setQueryData(listKey, []);
  let restore: ReturnType<typeof useRestoreWorkspace> | undefined;
  function RestoreProbe() {
    restore = useRestoreWorkspace(ID);
    return null;
  }
  await act(async () => {
    create(React.createElement(QueryClientProvider, { client }, React.createElement(RestoreProbe)));
  });
  summary = () => Response.json({ ...ROW, state: 'active' });
  await act(async () => {
    await restore?.mutateAsync();
  });
  await advance(10);
  expect(calls.filter((call) => call.method === 'POST')).toEqual([{ method: 'POST', url: `${SUMMARY}/restore` }]);
  expect(summaryGets()).toBe(2);
  expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  expect(client.getQueryData<{ state?: string }>(qk.project.summary(ID))?.state).toBe('active');
});
