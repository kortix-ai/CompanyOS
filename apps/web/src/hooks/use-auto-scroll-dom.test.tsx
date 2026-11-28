import { afterEach, describe, expect, test } from 'bun:test';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useAutoScroll } from '@kortix/ui/internal/hooks/use-auto-scroll';

/**
 * The transcript sits on the composer (KRTX-5238), through the real hook: the gap under the
 * last turn is one fixed value, so nothing above it moves when the agent starts or stops, when
 * a person sends, or when another agent reports. The old hook sized a room under the newest
 * turn (viewport − turn height) that appeared while the agent worked and vanished when it
 * stopped: the reported jumping.
 */

const win = new Window({ width: 1000, height: 600 });
Object.defineProperties(globalThis, {
  window: { value: win, configurable: true },
  document: { value: win.document, configurable: true },
  requestAnimationFrame: {
    value: (cb: (t: number) => void) => {
      cb(0);
      return 0;
    },
    configurable: true,
  },
  cancelAnimationFrame: { value: () => {}, configurable: true },
  ResizeObserver: { value: win.ResizeObserver, configurable: true },
  MutationObserver: { value: win.MutationObserver, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});

interface Rect {
  top: number;
  height: number;
}

const stubRect = (el: Element, rect: Rect) => {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      top: rect.top,
      bottom: rect.top + rect.height,
      height: rect.height,
      left: 0,
      right: 0,
      width: 0,
      x: rect.top,
      y: rect.top,
      toJSON: () => ({}),
    }),
    configurable: true,
  });
};

/** A viewport over `scrollHeight` px of content; `scrollTop` is a plain value the hook writes. */
const stubViewport = (el: Element, clientHeight: number, scrollHeight = clientHeight) => {
  let top = 0;
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { get: () => top, set: (v: number) => (top = v), configurable: true });
};

/** The stubbed geometry of one fixture row. */

interface Row {
  id: string;
  top: number;
  height: number;
  /** Carries `data-turn-continues` (a compaction or the work after it). */
  continues?: boolean;
}

let autoRef: ReturnType<typeof useAutoScroll> | null = null;

function Harness({ rows }: { rows: Row[] }) {
  const auto = useAutoScroll({ hasContent: true });
  // Captured in an effect, not render: the test drives the hook's public
  // methods (scrollToBottom) from outside act() via this module-level ref.
  useEffect(() => {
    autoRef = auto;
  });
  return (
    <div ref={auto.scrollRef} data-test="scroll">
      <div ref={auto.contentRef} data-test="content">
        {rows.map((row) => (
          <div
            key={row.id}
            data-turn-id={row.id}
            data-turn-continues={row.continues ? '' : undefined}
          />
        ))}
        <div ref={auto.spacerElRef} data-test="spacer" />
      </div>
    </div>
  );
}

// DOM values are typed through the global document (lib.dom) while the
// runtime objects are happy-dom's — the same lie every happy-dom test here
// tells (game-of-life.test.tsx). `win` is only for the runtime globals above.
const host = document.createElement('div');
document.body.appendChild(host);
const root = createRoot(host);

/** Mount the fixture and stub the geometry `sizeRoom` reads. */
function mount(rows: Row[], viewport = 600, scrollHeight = viewport) {
  act(() => {
    root.render(<Harness rows={rows} />);
  });
  const content = host.querySelector('[data-test="content"]')!;
  const scroll = host.querySelector('[data-test="scroll"]')!;
  stubViewport(scroll, viewport, scrollHeight);
  const els = Array.from(content.querySelectorAll('[data-turn-id]'));
  for (const [i, row] of rows.entries()) stubRect(els[i]!, { top: row.top, height: row.height });
  // The spacer lives at the end of the content: its top edge is the content end.
  const end = rows.reduce((max, r) => Math.max(max, r.top + r.height), 0);
  stubRect(content.querySelector('[data-test="spacer"]')!, { top: end, height: 0 });
  return { content, scroll };
}

/** The spacer height after a settle (`scrollToBottom` drives one). */
function spacerHeight(): string | null {
  const spacer = host.querySelector<HTMLElement>('[data-test="spacer"]');
  act(() => autoRef?.scrollToBottom());
  return spacer?.style.height ?? null;
}

afterEach(async () => {
  await act(async () => root.render(null));
  autoRef = null;
});

describe('the transcript sits on the composer: one fixed gap under the last turn', () => {
  test('a short newest turn gets no room under it, only the 24 px gap', () => {
    // A 40 px newest turn in a 600 px viewport: the old room was 600 − 40 − 24 = 536 px.
    mount([
      { id: 'u0', top: 0, height: 400 },
      { id: 'u1', top: 400, height: 40 },
    ]);
    expect(spacerHeight()).toBe('24px');
  });

  test('the gap does not change with the newest turn: a send, a report, a turn end', () => {
    mount([{ id: 'u0', top: 0, height: 100 }]);
    expect(spacerHeight()).toBe('24px');
    mount([
      { id: 'u0', top: 0, height: 100 },
      { id: 'u1', top: 100, height: 300 },
      { id: 'report', top: 400, height: 20, continues: true },
    ]);
    expect(spacerHeight()).toBe('24px');
  });

  test('a send puts the viewport at the end in one instant write', () => {
    const { scroll } = mount([{ id: 'u0', top: 0, height: 2000 }], 600, 2000);
    let glides = 0;
    Object.defineProperty(scroll, 'scrollTo', { value: () => (glides += 1), configurable: true });
    act(() => autoRef?.anchorTurn('u0'));
    expect((scroll as HTMLElement).scrollTop).toBe(1400);
    expect(glides).toBe(0);
    expect((scroll as HTMLElement).dataset.follow).toBe('true');
  });
});
