import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const win = new Window({ url: 'https://example.test/' });
const dom = win as unknown as Record<string, unknown>;
for (const key of ['window', 'document', 'navigator', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle']) {
  const value = dom[key];
  Object.defineProperty(globalThis, key, {
    value: typeof value === 'function' && /^[a-z]/.test(key) ? (value as () => void).bind(win) : value,
    configurable: true,
  });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });

const { CommandRoot, CommandInputCore, CommandListCore, CommandItemCore } = await import('./command-core');

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
const selected = (host: Element) => host.querySelector('[aria-selected="true"]')?.textContent;

/** The palette's shape: a controlled search box, a root that owns the selection. */
async function mountPalette() {
  let setQuery: (query: string) => void = () => {};
  function Input() {
    const [query, set] = React.useState('');
    setQuery = set;
    return <CommandInputCore value={query} onValueChange={set} />;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CommandRoot>
        <Input />
        <CommandListCore>
          <CommandItemCore value="Apple">Apple</CommandItemCore>
          <CommandItemCore value="Banana">Banana</CommandItemCore>
          <CommandItemCore value="Blueberry">Blueberry</CommandItemCore>
        </CommandListCore>
      </CommandRoot>,
    ),
  );
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  await settle();
  return { host, type: (query: string) => act(async () => setQuery(query)).then(settle) };
}

test('typing a search selects the first row that matches, so Enter has a target', async () => {
  const palette = await mountPalette();
  expect(selected(palette.host)).toBe('Apple');

  await palette.type('b');
  expect(selected(palette.host)).toBe('Banana');

  await palette.type('blu');
  expect(selected(palette.host)).toBe('Blueberry');

  await palette.type('');
  expect(selected(palette.host)).toBe('Apple');
});

test('a selected row that stops matching hands the selection to the first row still shown', async () => {
  // The command palette renders rows from a deferred copy of the search: a
  // row can stop matching a render after the search changed, while it stays
  // mounted. The selection must move to a row the user can see.
  let setRowValue: (value: string) => void = () => {};
  let setQuery: (query: string) => void = () => {};
  function Rows() {
    const [rowValue, set] = React.useState('custom session');
    setRowValue = set;
    return (
      <>
        <CommandItemCore value={rowValue}>Session</CommandItemCore>
        <CommandItemCore value="Customize">Customize</CommandItemCore>
      </>
    );
  }
  function Input() {
    const [query, set] = React.useState('');
    setQuery = set;
    return <CommandInputCore value={query} onValueChange={set} />;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CommandRoot>
        <Input />
        <CommandListCore>
          <Rows />
        </CommandListCore>
      </CommandRoot>,
    ),
  );
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  await settle();

  await act(async () => setQuery('custo'));
  await settle();
  expect(selected(host)).toBe('Session');

  await act(async () => setRowValue('session'));
  await settle();
  expect([...host.querySelectorAll('[cmdk-item]')].map((row) => row.textContent)).toEqual(['Customize']);
  expect(selected(host)).toBe('Customize');
});

test('rows that arrive above the first pick take the selection; a row the user picked keeps it', async () => {
  let showEarly: (show: boolean) => void = () => {};
  let setQuery: (query: string) => void = () => {};
  function Rows() {
    const [early, set] = React.useState(false);
    showEarly = set;
    return (
      <>
        {early ? <CommandItemCore value="Settings early">Settings early</CommandItemCore> : null}
        <CommandItemCore value="Settings late">Settings late</CommandItemCore>
        <CommandItemCore value="Settings last">Settings last</CommandItemCore>
      </>
    );
  }
  function Input() {
    const [query, set] = React.useState('');
    setQuery = set;
    return <CommandInputCore value={query} onValueChange={set} />;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CommandRoot>
        <Input />
        <CommandListCore>
          <Rows />
        </CommandListCore>
      </CommandRoot>,
    ),
  );
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  await settle();
  await act(async () => setQuery('set'));
  await settle();
  expect(selected(host)).toBe('Settings late');

  // The host's deferred rows mount above the pick: the pick follows the list.
  await act(async () => showEarly(true));
  await settle();
  expect(selected(host)).toBe('Settings early');

  // The user moves down; a later row change does not take it back.
  const list = host.querySelector('[cmdk-root]')!;
  await act(async () => {
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  await settle();
  expect(selected(host)).toBe('Settings late');
  await act(async () => showEarly(false));
  await settle();
  await act(async () => showEarly(true));
  await settle();
  expect(selected(host)).toBe('Settings late');
});
