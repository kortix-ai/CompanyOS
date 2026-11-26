import { afterEach, expect, jest, test } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { Command } from '../../primitives/command';
import Hint from '../../primitives/hint';
import { IntlTestProvider } from '../../test-utils/intl';
import { ModelPickerPanel } from './model-picker-panel';

const win = new Window();
Object.defineProperties(globalThis, {
  window: { value: win, configurable: true },
  document: { value: win.document, configurable: true },
  navigator: { value: win.navigator, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});

afterEach(() => jest.useRealTimers());

test('rail labels open on first hover without changing other hint delays', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <IntlTestProvider>
          <Command>
            <ModelPickerPanel
              browseModels={[]}
              pickableModels={[]}
              searchModels={[]}
              search=""
              onSearchChange={() => {}}
              selected={null}
              onPick={() => {}}
              isFavorite={() => false}
              setFavorite={() => {}}
              loading={false}
              emptyState={null}
              searchEmpty={null}
              onConnectChatGpt={() => {}}
              connectLabel="Connect"
            />
          </Command>
          <Hint label="Unrelated hint"><button>Other control</button></Hint>
        </IntlTestProvider>,
      );
    });
    jest.useFakeTimers();
    const hover = async (button: Element) => {
      await act(async () => {
        button.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
        button.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true }));
        jest.advanceTimersByTime(1);
      });
    };
    const chatGpt = host.querySelector('[role="tab"][aria-label="ChatGPT"]');
    expect(chatGpt).not.toBeNull();
    if (!chatGpt) throw new Error('ChatGPT tab missing');
    await hover(chatGpt);
    expect(chatGpt.getAttribute('data-state')).toBe('delayed-open');
    await act(async () => {
      chatGpt.dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: false }));
      jest.advanceTimersByTime(1000);
    });
    const other = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Other control');
    expect(other).toBeDefined();
    if (!other) throw new Error('Other control missing');
    await hover(other);
    expect(other.getAttribute('data-state')).toBe('closed');
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(other.getAttribute('data-state')).toBe('delayed-open');
  } finally {
    jest.useRealTimers();
    await act(async () => root.unmount());
    host.remove();
  }
});
