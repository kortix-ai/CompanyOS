import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { ReactNode } from 'react';

import { toolCallBlock, type Step, type ToolCallBlock } from '@kortix/sdk';

/**
 * A tool call clicked in the chat must never open an empty right panel.
 *
 * The chat opens the panel synchronously (`focusToolCall` flips
 * `isSidePanelOpen`); the handoff effect then opens a detail — until now ONLY
 * when the call's step was found. A call whose step `groupSteps` drops (the
 * context-engine bookkeeping tools a chat row still renders) left the panel
 * open with nothing on it. Rendered for real (react-dom on happy-dom).
 */
const OVERRIDE = ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'FocusEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'sessionStorage'];
const saved: Record<string, unknown> = {};

let m: {
  act: typeof import('react').act;
  createRoot: typeof import('react-dom/client').createRoot;
  QueryClient: typeof import('@tanstack/react-query').QueryClient;
  QueryClientProvider: typeof import('@tanstack/react-query').QueryClientProvider;
  UiProvider: typeof import('../../providers/ui-provider').UiProvider;
  TooltipProvider: typeof import('../../primitives/tooltip').TooltipProvider;
  usePanelHandoffs: typeof import('./shared/use-panel-handoffs').usePanelHandoffs;
  useKortixComputerStore: typeof import('../../internal/stores/kortix-computer-store').useKortixComputerStore;
  DetailLayer: typeof import('./easy/detail-view').DetailLayer;
  SessionDetailPanel: typeof import('./session-detail-panel').SessionDetailPanel;
};

beforeAll(async () => {
  const win = new Window({ url: 'http://localhost/', width: 1440, height: 900 });
  const g = globalThis as Record<string, unknown>;
  const w = win as unknown as Record<string, unknown>;
  const keys = [...OVERRIDE, ...Object.getOwnPropertyNames(w).filter((k) => !(k in g))];
  for (const key of keys) {
    saved[key] = g[key];
    g[key] = key === 'window' ? win : w[key];
  }
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const query = await import('@tanstack/react-query');
  m = {
    act: (await import('react')).act,
    createRoot: (await import('react-dom/client')).createRoot,
    QueryClient: query.QueryClient,
    QueryClientProvider: query.QueryClientProvider,
    UiProvider: (await import('../../providers/ui-provider')).UiProvider,
    TooltipProvider: (await import('../../primitives/tooltip')).TooltipProvider,
    usePanelHandoffs: (await import('./shared/use-panel-handoffs')).usePanelHandoffs,
    useKortixComputerStore: (await import('../../internal/stores/kortix-computer-store')).useKortixComputerStore,
    DetailLayer: (await import('./easy/detail-view')).DetailLayer,
    SessionDetailPanel: (await import('./session-detail-panel')).SessionDetailPanel,
  };
  // The built-in tool renderers (GenericTool draws a `prune` call).
  await import('../tool/tools/register');
});

afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete g[key];
    else g[key] = value;
  }
});

afterEach(async () => {
  await m.act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  // Reset the store's focus and panel state between tests.
  m.useKortixComputerStore.setState({ focusedToolCallId: null, isSidePanelOpen: false });
});

// The real trigger: a context-engine bookkeeping tool. The chat renders its
// row (GenericTool — no registered renderer, not in HIDDEN_TOOLS) and is
// clickable; `groupSteps` drops it (`familyForTool === 'hidden'`), so the
// step lookup in the handoff used to miss it.
const PRUNE = toolCallBlock({
  type: 'tool',
  tool: 'prune',
  callID: 'call-prune',
  state: { status: 'completed', input: {}, output: 'compacted 2 turns' },
} as never) as ToolCallBlock;

const BASH = toolCallBlock({
  type: 'tool',
  tool: 'bash',
  callID: 'call-bash',
  state: { status: 'completed', input: { command: 'ls' }, output: 'files' },
} as never) as ToolCallBlock;

let root: ReturnType<typeof import('react-dom/client').createRoot> | null = null;
const queryClient = () => new m.QueryClient({ defaultOptions: { queries: { retry: false } } });

type HandoffArgs = Parameters<typeof m.usePanelHandoffs>[0];

function Harness(props: { args: Omit<HandoffArgs, 'openDetail'>; onOpen: (detail: unknown) => void }) {
  m.usePanelHandoffs({
    ...props.args,
    openDetail: props.onOpen as never,
  });
  return null;
}

async function render(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const tree = (n: ReactNode) => (
    <m.QueryClientProvider client={queryClient()}>
      <m.UiProvider>
        <m.TooltipProvider>{n}</m.TooltipProvider>
      </m.UiProvider>
    </m.QueryClientProvider>
  );
  await m.act(async () => {
    root = m.createRoot(host);
    root.render(tree(node));
  });
  return {
    host,
    rerender: (n: ReactNode) => m.act(async () => root?.render(tree(n))),
  };
}

const baseArgs = {
  sessionId: 'route-session',
  isRunning: false,
  outcome: 'succeeded' as const,
  apps: [],
  files: [],
  detail: null,
  handleOpenOutput: () => {},
  openTerminal: () => {},
  openAudit: () => {},
  openReminders: () => {},
  openDesktop: () => {},
  openBrowser: () => {},
  openFiles: () => {},
} as unknown as Omit<HandoffArgs, 'openDetail' | 'steps' | 'calls'>;

describe('a chat tool-call click lands on panel content', () => {
  test('step found: the step detail opens (unchanged behavior)', async () => {
    const step: Step<ToolCallBlock> = {
      id: 'call-bash',
      family: 'run',
      label: 'Ran 1 command',
      parts: [BASH],
      status: 'done',
    };
    const state: { opened: { key: string } | null } = { opened: null };
    await render(
      <Harness
        onOpen={(d) => (state.opened = d as { key: string })}
        args={{ ...baseArgs, steps: [step], calls: [BASH] }}
      />,
    );
    await m.act(async () => m.useKortixComputerStore.getState().focusToolCall('call-bash'));
    expect(state.opened?.key).toBe('step:call-bash:call-bash');
    expect(m.useKortixComputerStore.getState().focusedToolCallId).toBeNull();
  });

  test('step dropped (context bookkeeping): the call itself opens, never a blank panel', async () => {
    const opened: Array<{ key: string; title: string; body: ReactNode }> = [];
    const { host, rerender } = await render(
      <Harness
        onOpen={(d) => opened.push(d as never)}
        args={{ ...baseArgs, steps: [], calls: [PRUNE] }}
      />,
    );
    await m.act(async () => m.useKortixComputerStore.getState().focusToolCall('call-prune'));
    expect(opened.length).toBe(1);
    expect(opened[0].key).toBe('tool:call-prune');
    // The focus is consumed only once the detail exists.
    expect(m.useKortixComputerStore.getState().focusedToolCallId).toBeNull();
    void rerender;
    void host;

    // Criterion: the panel RENDERS the call's content. Mount the opened detail
    // the way `DetailLayer` frames it and assert the tool view is drawn.
    const detailHost = document.createElement('div');
    document.body.appendChild(detailHost);
    await m.act(async () => {
      const r = m.createRoot(detailHost);
      r.render(
        <m.QueryClientProvider client={queryClient()}>
          <m.UiProvider>
            <m.TooltipProvider>
              <m.DetailLayer
                detail={opened[0] as never}
                onBack={() => {}}
                isMobile={false}
              >
                {null}
              </m.DetailLayer>
            </m.TooltipProvider>
          </m.UiProvider>
        </m.QueryClientProvider>,
      );
    });
    expect(detailHost.textContent).toContain('Prune');
  });

  test('steps not derived yet (streaming race): the focus waits and lands once they arrive', async () => {
    const opened: Array<{ key: string }> = [];
    const { rerender } = await render(
      <Harness
        onOpen={(d) => opened.push(d as { key: string })}
        args={{ ...baseArgs, steps: [], calls: [] }}
      />,
    );
    await m.act(async () => m.useKortixComputerStore.getState().focusToolCall('call-prune'));
    // The panel opened on a call the panel data does not hold yet: nothing to
    // open, and the focus stays armed for the data's arrival.
    expect(opened.length).toBe(0);
    expect(m.useKortixComputerStore.getState().focusedToolCallId).toBe('call-prune');

    // The thread's derivation catches up.
    await rerender(
      <Harness
        onOpen={(d) => opened.push(d as { key: string })}
        args={{ ...baseArgs, steps: [], calls: [PRUNE] }}
      />,
    );
    expect(opened.length).toBe(1);
    expect(opened[0].key).toBe('tool:call-prune');
    expect(m.useKortixComputerStore.getState().focusedToolCallId).toBeNull();
  });
});
