import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act } from 'react';

import { createKortix } from '@kortix/sdk';
import { useProjectSessions } from '@kortix/sdk/react';
import { testRender } from '@opentui/react/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { pollDueQueries } from '../../lib/query-polling.ts';
import { LIVE_POLL_MS, useRefreshSessions, useSidebarSessions } from './use-sidebar-sessions.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT = 'P1';
type Bucket = 'all' | 'me' | 'others' | 'automated';

/** Requests per list, keyed by the `started_by` they sent ('all' = none). */
let requests: Record<Bucket, number>;
let statusOf: Partial<Record<Bucket, string>>;
let refreshApp: () => Promise<unknown>;
let refreshSidebar: () => Promise<unknown>;
let destroy: () => void = () => {};
const realFetch = globalThis.fetch;

createKortix({ backendUrl: 'http://test.local', getToken: async () => 'token' });

beforeEach(() => {
  requests = { all: 0, me: 0, others: 0, automated: 0 };
  statusOf = {};
  globalThis.fetch = mock(async (url: unknown) => {
    const bucket = (new URL(String(url)).searchParams.get('started_by') ?? 'all') as Bucket;
    requests[bucket] += 1;
    return Response.json([{ session_id: `S-${bucket}`, status: statusOf[bucket] ?? 'completed' }]);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  destroy();
  globalThis.fetch = realFetch;
});

/** The app's unfiltered list and the sidebar's buckets, mounted together as in the TUI. */
function Probe() {
  useProjectSessions(PROJECT, { enabled: true });
  refreshApp = useRefreshSessions(PROJECT);
  refreshSidebar = useSidebarSessions(PROJECT).refresh;
  return <text>probe</text>;
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { renderer } = await testRender(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
    { width: 20, height: 2 },
  );
  destroy = () => renderer.destroy();
  await settle();
  return client;
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

describe('useSidebarSessions (KRTX-4898)', () => {
  test('a refresh from the app or the sidebar refetches all four session lists', async () => {
    await mount();
    expect(requests).toEqual({ all: 1, me: 1, others: 1, automated: 1 });

    await act(async () => {
      await refreshApp();
    });
    expect(requests).toEqual({ all: 2, me: 2, others: 2, automated: 2 });

    await act(async () => {
      await refreshSidebar();
    });
    expect(requests).toEqual({ all: 3, me: 3, others: 3, automated: 3 });
  });

  test('every bucket with a live row polls; a settled bucket does not', async () => {
    statusOf = { others: 'running', automated: 'running' };
    const client = await mount();
    expect(requests).toEqual({ all: 1, me: 1, others: 1, automated: 1 });

    // The TUI's own poll driver (TanStack schedules no `refetchInterval` in Bun).
    await act(async () => {
      pollDueQueries(client, Date.now() + LIVE_POLL_MS);
    });
    await settle();
    expect(requests).toEqual({ all: 1, me: 1, others: 2, automated: 2 });
  });
});
