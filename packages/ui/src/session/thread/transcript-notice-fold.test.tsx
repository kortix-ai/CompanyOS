import { describe, expect, test } from 'bun:test';
import { peerMessagePromptText } from '@kortix/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { sessionLogOfV1Rows, sessionLogTurns, type SessionLogTurn } from '@kortix/sdk';

import { TranscriptTurnRow } from '../index';

/**
 * The render decision of KRTX-4732: a turn whose prompt is another agent's
 * notice (a sub-agent's report, a teammate's update) folds that row into its
 * "Worked for" fold once the turn settles, so the parent's answer is the only
 * top-level message and the child exchange stays reachable by opening the
 * row. A live turn shows the row until the turn settles, and a turn with no
 * answer at all keeps the row at the top level, where it stays reachable.
 */
const peerPrompt = peerMessagePromptText({
  kind: 'message',
  from: 'reviewer',
  fromShortId: '12345678',
  messageId: 'peer-1',
  summary: 'Review done, 2 comments',
  text: 'Rebased and reviewed. Two comments on the synthetic diff.',
});

/** A report turn that did work: a tool call, then the parent's answer text. */
const reportTurnRows = [
  {
    info: { id: 'peer-prompt', sessionID: 'rs', role: 'user', agent: 'build', model: { providerID: 'test', modelID: 'test' }, time: { created: 1 } },
    parts: [{ id: 'peer-text', sessionID: 'rs', messageID: 'peer-prompt', type: 'text', synthetic: true, text: peerPrompt }],
  },
  {
    info: { id: 'peer-answer', sessionID: 'rs', role: 'assistant', agent: 'build', modelID: 'test', providerID: 'test', mode: 'build', path: { cwd: '/', root: '/' }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, parentID: 'peer-prompt', time: { created: 2, completed: 9_000 } },
    parts: [
      { id: 'peer-bash', sessionID: 'rs', messageID: 'peer-answer', type: 'tool', callID: 'call-peer-bash', tool: 'bash', state: { status: 'completed', input: { command: 'echo synthetic' }, output: 'synthetic' } },
      { id: 'peer-final', sessionID: 'rs', messageID: 'peer-answer', type: 'text', text: 'Run is done: 2 of 3 checks passed.' },
    ],
  },
] as never[];

const reportTurn: SessionLogTurn = sessionLogTurns(sessionLogOfV1Rows('p', 'rs', reportTurnRows).threads[0]!)[0]!;

function renderRow(turn: SessionLogTurn, working = false): string {
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(TranscriptTurnRow, {
        turnId: turn.id,
        viewportClassName: '',
        suppressed: false,
        showBusyRow: false,
        turn,
        turnOutcome: {},
        isLast: true,
        ownsPlan: false,
        sessionId: 's',
        sessionStatus: undefined,
        permissions: [],
        questions: [],
        sessionWorking: working,
        isWorkingTurn: working,
        suppressBusyIndicator: false,
        awaitingUser: false,
        pending: false,
        isFirstTurn: false,
        onPermissionReply: () => Promise.resolve(),
        onRewind: () => undefined,
        rewindDisabled: false,
        fullTextState: 'idle',
        onLoadFullText: () => undefined,
        modelOptions: 2,
      }),
    ),
  );
}

describe('a notice turn folds its row into the work fold (KRTX-4732)', () => {
  test('a settled report turn folds the peer message behind its Worked row', () => {
    const html = renderRow(reportTurn);
    const worked = html.indexOf('Worked for');
    expect(worked).toBeGreaterThan(-1);
    // The row is fold content: like every fold's work, it mounts on the first
    // open, so the default level shows no child message block. The parent's
    // answer is the turn's only top-level content.
    expect(html).not.toContain('data-testid="peer-message-turn"');
    expect(html).not.toContain('Rebased and reviewed. Two comments on the synthetic diff.');
    expect(html).toContain('Run is done: 2 of 3 checks passed.');
  });

  test('a report turn that mounted live keeps its row in the fold, hidden while closed', () => {
    // A turn the reader watched settle keeps its work mounted (the fold's
    // no-remount rule), so the settled render carries the row hidden in the
    // fold — opening the row shows it.
    const live = renderRow(reportTurn, true);
    expect(live).toContain('data-testid="peer-message-turn"');
    expect(live).not.toContain('Worked for');
  });

  test('a live report turn shows the peer message until the turn settles', () => {
    const html = renderRow(reportTurn, true);
    const row = html.indexOf('data-testid="peer-message-turn"');
    expect(row).toBeGreaterThan(-1);
    // No fold while the turn works: the row renders visible, not hidden.
    expect(html.slice(Math.max(0, row - 300), row)).not.toContain('hidden');
    expect(html).not.toContain('Worked for');
  });

  test('a report turn with no answer keeps the row at the top level', () => {
    const thread = sessionLogOfV1Rows('p', 'rs', [
      {
        info: { id: 'peer-prompt', sessionID: 'rs', role: 'user', agent: 'build', model: { providerID: 'test', modelID: 'test' }, time: { created: 1 } },
        parts: [{ id: 'peer-text', sessionID: 'rs', messageID: 'peer-prompt', type: 'text', synthetic: true, text: peerPrompt }],
      },
    ] as never[]).threads[0]!;
    const turn = sessionLogTurns(thread)[0]!;
    const html = renderRow(turn);
    const row = html.indexOf('data-testid="peer-message-turn"');
    expect(row).toBeGreaterThan(-1);
    // No answer row to fold into: the row renders visible at the top level.
    expect(html.slice(Math.max(0, row - 300), row)).not.toContain('hidden');
    expect(html).not.toContain('Worked for');
  });
});
