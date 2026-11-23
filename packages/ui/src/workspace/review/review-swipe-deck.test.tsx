import { afterEach, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReviewVerdict } from '@kortix/sdk';
import { IntlTestProvider } from '../../test-utils/intl';
import { TestUiHost } from '../../test-utils/ui-host';
import type { ReviewItem } from './types';

const win = new Window();
Object.assign(globalThis, {
  window: win,
  document: win.document,
  navigator: win.navigator,
  MutationObserver: win.MutationObserver,
  KeyboardEvent: win.KeyboardEvent,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  HTMLElement: win.HTMLElement,
  Element: win.Element,
  Node: win.Node,
  ShadowRoot: win.ShadowRoot,
});
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
const { ReviewSwipeDeck } = await import('./review-swipe-deck');

const base = {
  summary: 'Synthetic summary',
  risk: 'low',
  status: 'needs_you',
  source: 'agent',
  agent: 'Agent',
  createdAt: '2026-11-20T00:00:00Z',
  project: 'Synthetic project',
  actor: { name: 'Agent', initials: 'A' },
  primaryAction: 'Approve',
} as const;

const change = {
  ...base,
  id: 'cr:synthetic-1',
  kind: 'change',
  title: 'Add the pricing table',
  detail: {
    number: 7,
    whatChanged: ['Adds a table'],
    impact: '',
    verification: [],
    advanced: { headRef: 'h', baseRef: 'b', headSha: '1', baseSha: '0', additions: 12, deletions: 3, files: [] },
  },
} as unknown as ReviewItem;

const decision = {
  ...base,
  id: 'synthetic-decision',
  kind: 'decision',
  title: 'Pick a region',
  detail: { question: 'Which region?', options: [{ id: 'eu', label: 'EU' }] },
} as unknown as ReviewItem;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  jest.useRealTimers();
});

function mount(items: ReviewItem[], onDecide: (item: ReviewItem, verdict: ReviewVerdict) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <IntlTestProvider>
        <TestUiHost>
          <ReviewSwipeDeck items={items} allows={() => true} onDecide={onDecide} onOpen={() => {}} />
        </TestUiHost>
      </IntlTestProvider>,
    ),
  );
  return host;
}

const button = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

test('Merge on a change sends approve after the Undo window, not before', () => {
  jest.useFakeTimers();
  const decided: [string, ReviewVerdict][] = [];
  const host = mount([change], (item, verdict) => decided.push([item.id, verdict]));
  expect(host.querySelector('[data-testid="review-swipe-card"]')?.textContent).toContain('Add the pricing table');

  act(() => button(host, 'Merge')!.click());
  act(() => jest.advanceTimersByTime(4_000));
  expect(decided).toEqual([]);
  act(() => jest.advanceTimersByTime(2_000));
  expect(decided).toEqual([['cr:synthetic-1', 'approve']]);
});

test('Close on a change sends reject', () => {
  jest.useFakeTimers();
  const decided: ReviewVerdict[] = [];
  const host = mount([change], (_item, verdict) => decided.push(verdict));
  act(() => button(host, 'Close')!.click());
  act(() => jest.advanceTimersByTime(6_000));
  expect(decided).toEqual(['reject']);
});

test('a decision offers no swipe verdict: Yes and No are disabled', () => {
  const host = mount([decision], () => {});
  expect(button(host, 'Yes')?.disabled).toBe(true);
  expect(button(host, 'No')?.disabled).toBe(true);
  expect(host.textContent).toContain('Open it to choose an answer');
});

test('an empty deck says the viewer is caught up', () => {
  const host = mount([], () => {});
  expect(host.textContent).toContain('You are all caught up');
});
