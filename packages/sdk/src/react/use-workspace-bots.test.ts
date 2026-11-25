import { beforeEach, describe, expect, mock, test } from 'bun:test';

let invalidated: unknown[][] = [];

// Same harness as `./use-project-spaces.test.ts`: `useQuery` returns its config.
mock.module('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => config,
  useMutation: (config: Record<string, unknown>) => config,
  useQueryClient: () => ({ invalidateQueries: (opts: { queryKey: unknown[] }) => { invalidated.push(opts.queryKey); return Promise.resolve(); } }),
}));

const { useSetWorkspaceBotPaused, useWorkspaceBots } = await import('./use-workspace-bots');
const { qk } = await import('./query-keys');
const { configureKortix } = await import('../core/http/config');

let calls: { url: string; method: string }[] = [];
beforeEach(() => {
  calls = [];
  invalidated = [];
  configureKortix({ backendUrl: 'http://test.local', getToken: async () => 'tok' });
  globalThis.fetch = mock(async (url: unknown, opts: { method?: string } = {}) => {
    calls.push({ url: String(url), method: opts.method ?? 'GET' });
    return new Response(JSON.stringify({ bots: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
});

describe('useWorkspaceBots', () => {
  test('reads the bot list under the spaces key, so opening a DM refreshes it', async () => {
    const query = useWorkspaceBots('P1') as any;
    expect(query.queryKey).toEqual(qk.project.bots('P1'));
    expect(qk.project.bots('P1').slice(0, qk.project.spaces('P1').length)).toEqual([...qk.project.spaces('P1')]);
    expect(query.enabled).toBe(true);
    expect(await query.queryFn()).toEqual([]);
    expect(calls[0]).toEqual({ method: 'GET', url: 'http://test.local/workspaces/P1/bots' });
  });

  test('is disabled without a workspace id or while the caller disables it', () => {
    expect((useWorkspaceBots(null) as any).enabled).toBe(false);
    expect((useWorkspaceBots('P1', { enabled: false }) as any).enabled).toBe(false);
  });
});

describe('useSetWorkspaceBotPaused', () => {
  test('POSTs the pause and invalidates the bot list', async () => {
    const mutation = useSetWorkspaceBotPaused('P1') as any;
    await mutation.mutationFn({ name: 'marketing', paused: true });
    expect(calls[0]).toEqual({ method: 'POST', url: 'http://test.local/workspaces/P1/bots/marketing/pause' });
    await mutation.onSuccess();
    expect(invalidated).toEqual([[...qk.project.bots("P1")]]);
  });
});
