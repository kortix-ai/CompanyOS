import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AgentRow } from '../../agents/agent-model';
import { FinishedTasks, isFinishedAgent } from './background-tasks-card';

const row = (handle: string, state: AgentRow['state'], line: string | null = null): AgentRow => ({
  sessionId: `ses-${handle}`,
  handle,
  agent: null,
  named: true,
  state,
  attention: null,
  line,
  activityMs: Date.UTC(2026, 10, 23, 9, 48),
  workingSinceMs: null,
});

describe('Background tasks', () => {
  test('a done agent is finished; working, waiting, failed and stopped agents stay in the list', () => {
    expect(isFinishedAgent(row('a', 'completed'))).toBe(true);
    expect(isFinishedAgent(row('a', 'idle'))).toBe(true);
    for (const state of ['working', 'needs_input', 'failed', 'stopped'] as const) {
      expect(isFinishedAgent(row('a', state))).toBe(false);
    }
  });

  test('the finished list is one timeline node per agent, each opening that agent', () => {
    const html = renderToStaticMarkup(
      <FinishedTasks rows={[row('elon-research', 'completed', 'Verify claims'), row('jay-research', 'idle')]} onOpen={() => {}} />,
    );
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('elon-research');
    expect(html).toContain('Verify claims');
    // The rail runs between nodes, never past the last one.
    expect(html.match(/bg-border absolute/g)).toHaveLength(1);
  });
});
