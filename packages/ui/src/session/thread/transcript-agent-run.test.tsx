import { Window } from 'happy-dom';
import { afterEach, describe, expect, test } from 'bun:test';
import { peerMessagePromptText } from '@kortix/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { sessionLogAgentRuns, sessionLogOfV1Rows, sessionLogTurns } from '@kortix/sdk';

import { TranscriptTurnRow } from '../index';
import { hostAgentRuns } from './agent-run-props';

/**
 * KRTX-4732, the run fold: a person's agents report back as one unit. KRTX-5238: the run's row
 * stands on the person's turn that started the work ("Worked for 5m · 3 agents") and never moves;
 * every report turn folds its steps into that row, the agent's words to the person stay in view
 * in order, the absorbed turns draw nothing, and the agent's relays between colleagues
 * (`send_message`) are not shown. Synthetic values only.
 */

type V1MessageRow = Parameters<typeof sessionLogOfV1Rows>[2][number];

const child = (n: number) => `${String(n).padStart(8, '0')}-0b7c-4000-8000-2f1e00000000`;
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const min = (m: number) => T0 + m * 60_000;

const subagentNotice = (n: number) =>
  [
    'A background subagent you started has finished. This message is from the platform, not from the user.',
    `task_id: ${child(n)}`,
    'status: completed',
    '',
    `<task_result>\nReport ${n}: synthetic result.\n</task_result>`,
  ].join('\n');

// A teammate's finish: its idle notice. A plain message from a launched agent is progress, not its report.
const peerReport = peerMessagePromptText({
  kind: 'idle_notice',
  from: 'metrics-checker',
  fromShortId: child(2).slice(0, 8),
  messageId: 'm_2',
  summary: '5 of 6 numbers match',
  text: 'metrics-checker finished its turn and is idle.\n\nIts last answer: Checked all 6 numbers; one corrected.',
});

const assistantInfo = (id: string, parent: string, created: number, completed: number) => ({
  id, sessionID: 'rs', role: 'assistant' as const, agent: 'build', modelID: 'test', providerID: 'test', mode: 'build',
  path: { cwd: '/', root: '/' }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  parentID: parent, time: { created, completed },
});
const userRow = (id: string, text: string, created: number, synthetic = false): V1MessageRow => ({
  info: { id, sessionID: 'rs', role: 'user', agent: 'build', model: { providerID: 'test', modelID: 'test' }, time: { created } },
  parts: [{ id: `${id}-text`, sessionID: 'rs', messageID: id, type: 'text', ...(synthetic ? { synthetic: true } : {}), text }],
} as V1MessageRow);
const tool = (mid: string, n: number, name: string, input: Record<string, unknown>, metadata: Record<string, unknown> = {}) => ({
  id: `${mid}-t${n}`, sessionID: 'rs', messageID: mid, type: 'tool' as const, callID: `call-${mid}-${n}`, tool: name,
  state: { status: 'completed' as const, input, output: 'ok', title: name, metadata, time: { start: 1, end: 2 } },
});
const textPart = (mid: string, text: string) => ({ id: `${mid}-x`, sessionID: 'rs', messageID: mid, type: 'text' as const, text });

const rows: V1MessageRow[] = [
  userRow('launch', 'Ship the launch post.', min(0)),
  {
    info: assistantInfo('launch-a', 'launch', min(0), min(0.1)),
    parts: [
      tool('launch-a', 1, 'agent', { description: 'Draft the launch post', subagent_type: 'draft-writer' }, { sessionId: child(1) }),
      tool('launch-a', 2, 'agent', { description: 'Verify the numbers', subagent_type: 'metrics-checker' }, { sessionId: child(2) }),
      tool('launch-a', 3, 'agent', { description: 'Review the post', subagent_type: 'post-reviewer' }, { sessionId: child(3) }),
      textPart('launch-a', 'Three colleagues are on it.'),
    ],
  } as V1MessageRow,
  userRow('r1', subagentNotice(1), min(2), true),
  {
    info: assistantInfo('r1-a', 'r1', min(2), min(2.1)),
    parts: [tool('r1-a', 1, 'send_message', { to: 'post-reviewer', summary: 'Draft v1 is up', message: 'Review the draft.' })],
  } as V1MessageRow,
  userRow('r2', peerReport, min(3), true),
  { info: assistantInfo('r2-a', 'r2', min(3), min(3.1)), parts: [textPart('r2-a', 'Got the numbers, waiting on the review.')] } as V1MessageRow,
  userRow('r3', subagentNotice(3), min(5), true),
  { info: assistantInfo('r3-a', 'r3', min(5), min(5.1)), parts: [textPart('r3-a', 'The launch post is ready.')] } as V1MessageRow,
];

const turns = sessionLogTurns(sessionLogOfV1Rows('p', 'rs', rows).threads[0]!);
const layout = sessionLogAgentRuns(turns);
const byId = new Map(turns.map((turn) => [turn.id, turn]));
const anchor = byId.get('r3')!;
const run = layout.runs.get('r3')!;
const runTurns = run.turns.slice(0, -1).map((id) => byId.get(id)!);
const hosted = hostAgentRuns(turns, layout);
const launch = byId.get('launch')!;
const hostedRun = hosted.runs.get('launch')!;
const hostedTurns = hostedRun?.turns.map((id) => byId.get(id)!) ?? [];

type RowProps = ComponentProps<typeof TranscriptTurnRow>;
const base = (turn: RowProps['turn']): RowProps => ({
  turnId: turn.id, viewportClassName: '', suppressed: false, showBusyRow: false, turn, turnOutcome: {}, isLast: true,
  ownsPlan: false, sessionId: 's', sessionStatus: undefined, permissions: [], questions: [], sessionWorking: false,
  isWorkingTurn: false, suppressBusyIndicator: false, awaitingUser: false, pending: false, isFirstTurn: false,
  onPermissionReply: () => Promise.resolve(), onRewind: () => undefined, rewindDisabled: false, fullTextState: 'idle',
  onLoadFullText: () => undefined, modelOptions: 2,
});
const html = (props: RowProps) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(TranscriptTurnRow, props)));

const browser = new Window();
Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
Object.defineProperty(globalThis, 'document', { value: browser.document, configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
let mounted: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => mounted?.unmount()); });

describe('agent run fold (KRTX-4732)', () => {
  test('the fixture is one run of three agents, anchored on the answer', () => {
    expect([...layout.absorbed]).toEqual(['r1', 'r2']);
    expect(run.agents).toBe(3);
    // r1's relay has no delivered result in this fixture, so it hands the reviewer nothing and waits on nothing.
    expect([...layout.settledLaunches].sort()).toEqual(['launch', 'r1']);
  });

  test('the run moves to the person\'s turn that started it: one row, every report absorbed (KRTX-5238)', () => {
    expect([...hosted.runs.keys()]).toEqual(['launch']);
    expect(hostedRun.turns).toEqual(['r1', 'r2', 'r3']);
    expect([...hosted.absorbed].sort()).toEqual(['r1', 'r2', 'r3']);
    expect(hosted.anchorOf.get('r3')).toBe('launch');
    expect(hostedRun.agents).toBe(3);
  });

  test('a report turn that asks the person joins the run it follows, never a row of its own (KRTX-5238)', () => {
    // The SDK ends a run at a turn that asks the person; the next report starts a new run.
    const turn = (id: string, internal: boolean) =>
      ({ id, internal, live: false, user: { ...turns[0]!.user, message_id: id }, assistant: [] }) as unknown as (typeof turns)[number];
    const list = [turn('p', false), turn('r1', true), turn('ask', true), turn('r3', true)];
    const run = (id: string) => ({ anchor: id, turns: [id], agents: 1, started: 2, reported: 1, durationMs: 1000, live: false, stopped: false });
    const out = hostAgentRuns(list, { runs: new Map([['r1', run('r1')], ['r3', run('r3')]]), absorbed: new Set(), anchorOf: new Map(), settledLaunches: new Set() });
    expect([...out.runs.keys()]).toEqual(['p']);
    expect(out.runs.get('p')!.turns).toEqual(['r1', 'ask', 'r3']);
    expect([...out.absorbed].sort()).toEqual(['ask', 'r1', 'r3']);
  });

  test('one row over the work; every reply the agent wrote stays in view, in order (KRTX-5238)', () => {
    const out = html({ ...base(launch), agentRun: hostedRun, runTurns: hostedTurns });
    const row = out.indexOf('Worked for');
    expect(row).toBeGreaterThan(-1);
    expect(out.match(/Worked for/g)).toHaveLength(1);
    const replies = ['Three colleagues are on it.', 'Got the numbers, waiting on the review.', 'The launch post is ready.'].map((text) => out.indexOf(text));
    expect(replies.every((at) => at > row)).toBe(true);
    expect(replies).toEqual([...replies].sort((a, b) => a - b));
    // Folded and not yet opened: no report and no agent row is mounted.
    expect(out).not.toContain('metrics-checker');
    expect(out).not.toContain('Draft the launch post');
  });

  test('opening the row reveals the reports in place; the replies around them do not move (KRTX-5238)', async () => {
    await act(async () => {
      mounted = create(
        <QueryClientProvider client={new QueryClient()}>
          <TranscriptTurnRow {...base(launch)} agentRun={hostedRun} runTurns={hostedTurns} />
        </QueryClientProvider>,
      );
    });
    const toggle = mounted!.root.findAll((node) => node.type === 'button' && node.props['aria-expanded'] === false)[0]!;
    await act(async () => toggle.props.onClick());
    const folds = mounted!.root.findAll((node) => node.props['data-testid'] === 'agent-run-fold');
    expect(folds.length).toBe(3);
    expect(folds.every((fold) => fold.props.hidden === false)).toBe(true);
    // The replies are never inside a fold.
    for (const fold of folds) {
      expect(fold.findAll((node) => typeof node.props.content === 'string' && node.props.content.includes('Got the numbers')).length).toBe(0);
    }
    expect(JSON.stringify(mounted!.toJSON())).toContain('metrics-checker');
  });

  test('an absorbed turn draws nothing', () => {
    const out = html({ ...base(byId.get('r2')!), suppressed: true });
    expect(out).not.toContain('peer-message-turn');
    expect(out).not.toContain('Got the numbers');
  });

  test('opening the row shows each report and its work, never the relay calls', async () => {
    await act(async () => {
      mounted = create(
        <QueryClientProvider client={new QueryClient()}>
          <TranscriptTurnRow {...base(anchor)} agentRun={run} runTurns={runTurns} />
        </QueryClientProvider>,
      );
    });
    const toggle = mounted!.root.findAll((node) => node.type === 'button' && node.props['aria-expanded'] === false)[0]!;
    await act(async () => toggle.props.onClick());
    const members = mounted!.root.findAll((node) => node.props['data-testid'] === 'agent-run-member');
    expect(members).toHaveLength(2);
    const text = JSON.stringify(mounted!.toJSON());
    expect(text).toContain('metrics-checker');
    expect(text).not.toContain('post-reviewer · summary');
    expect(text.toLowerCase()).not.toContain('send message');
  });

  test('a live run says how many agents reported', () => {
    const live = { ...run, live: true, durationMs: null, reported: 2 };
    expect(html({ ...base(anchor), agentRun: live, runTurns, isWorkingTurn: true, sessionWorking: true })).toContain('Working · 2 of 3 agents reported');
  });

  test('live peer activity stays behind the same progress disclosure', async () => {
    const live = { ...run, live: true, durationMs: null, reported: 2 };
    await act(async () => {
      mounted = create(
        <QueryClientProvider client={new QueryClient()}>
          <TranscriptTurnRow {...base(byId.get('r2')!)} agentRun={live} runTurns={runTurns.slice(0, 1)} isWorkingTurn sessionWorking />
        </QueryClientProvider>,
      );
    });
    const notice = mounted!.root.find((node) => node.props['data-testid'] === 'peer-message-turn');
    let wrapper = notice.parent;
    while (wrapper && !(wrapper.type === 'div' && 'hidden' in wrapper.props)) wrapper = wrapper.parent;
    expect(wrapper?.props.hidden).toBe(true);
  });

  test('the launch turn folds its agent rows from the start, live or settled (KRTX-5238)', () => {
    for (const props of [base(launch), { ...base(launch), foldStartedWork: true }]) {
      const out = html(props);
      expect(out).toContain('Worked for 6s');
      expect(out).toContain('Three colleagues are on it.');
      expect(out).not.toContain('Draft the launch post');
    }
  });
});
