/** The gap (px) under the last turn, so streaming text never sits flush against the composer.
 *  It is the transcript's ONLY bottom gap — `session-chat.tsx` adds no bottom padding under
 *  the last turn. */
export const BOTTOM_GAP_PX = 24;
/** Within this many px of the end the reader counts as AT the end (scrollbar
 *  drags and wheel ticks rarely land on the exact pixel). */
export const AT_END_PX = 4;
/** How far from the end (in px of CONTENT, the bottom gap excluded) the chevron
 *  appears once the reader has left the end. */
export const CHEVRON_PX = 120;
/** How long after one of our own `scrollTop` writes a `scroll` event still
 *  counts as ours — one frame's slack, since the event lands later. */
export const OWN_SCROLL_MS = 80;

/** Pure: is the reader at the end? */
export function isAtEnd(distanceFromEnd: number): boolean {
  return distanceFromEnd <= AT_END_PX;
}

/** Pure: does the chevron show for a reader who is NOT following? */
export function chevronVisible(distanceFromContentEnd: number): boolean {
  return distanceFromContentEnd > CHEVRON_PX;
}

/**
 * Pure: does a `scroll` event mean the viewport left the end for good?
 *
 * Three gates, and every one of them exists because of a real regression:
 *
 * - `ours` — this hook writes `scrollTop` itself on every settle. Reading our
 *   own write as "the reader left" would drop follow the instant it started.
 * - `geometryChanged` — the browser clamps `scrollTop` when the content
 *   shrinks or the viewport grows, and that arrives as a scroll event with no
 *   reader behind it (a composer growing by 24px was the one that used to kill
 *   follow mid-send). A scroll event whose `scrollHeight`/`clientHeight` moved
 *   since the previous one is that clamp, not intent.
 * - `distanceFromEnd` — a scroll that is still AT the end changes nothing.
 *
 * What is left is a viewport that someone else moved away from the end while
 * the layout stood still: find-in-page, an anchor jump, the minimap, an
 * assistive tool, a test driver. Follow yields to it.
 */
export function shouldReleaseFollow(input: {
  following: boolean;
  ours: boolean;
  geometryChanged: boolean;
  distanceFromEnd: number;
}): boolean {
  if (!input.following || input.ours || input.geometryChanged) return false;
  return !isAtEnd(input.distanceFromEnd);
}

export type ScrollKeyIntent = 'up' | 'down' | 'end' | null;

/**
 * Pure: which way a key scrolls the transcript, or null when it does not
 * scroll it.
 *
 * Up is one intent — Cmd+ArrowUp, Ctrl+Home and bare Home all mean "the reader
 * took over" — so modifiers are deliberately not inspected. Down splits in two,
 * because resuming is the direction that can go wrong:
 *   'end'  — End / Cmd+ArrowDown. A discrete, unambiguous "go to the end", the
 *            keyboard form of the chevron, so it goes to the end and follows.
 *   'down' — PageDown / ArrowDown / Space. Ordinary movement: it resumes only
 *            if it actually lands at the end (isAtEnd), like a wheel-down.
 * Alt/Option is excluded: on macOS that is a caret move, not a scroll.
 */
export function classifyScrollKey(event: {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): ScrollKeyIntent {
  if (event.altKey) return null;
  switch (event.key) {
    case 'ArrowUp':
    case 'PageUp':
    case 'Home':
      return 'up';
    case 'End':
      return 'end';
    case 'ArrowDown':
      return event.metaKey ? 'end' : 'down';
    case 'PageDown':
      return 'down';
    case ' ':
    case 'Spacebar':
      return event.shiftKey ? 'up' : 'down';
    default:
      return null;
  }
}

/** Pure: an editable target owns its own caret and its own scrollport, so a
 *  key typed in the composer is never transcript intent. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return el.closest('[contenteditable="true"], [role="textbox"], [role="combobox"]') !== null;
}

/** Pure: Space activates the focused control instead of scrolling. Every other
 *  scroll key still scrolls while a button holds focus, so only Space is
 *  filtered on this one. */
export function isSpaceActivatedTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return (
    el.closest(
      'button, summary, a[href], [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"]',
    ) !== null
  );
}

/** Pure: the whole keyboard decision — key plus where focus is. Kept pure so
 *  the matrix (modifiers, editable focus, Space-on-a-button) is testable
 *  without a DOM. */
export function keyScrollIntentFor(event: {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target: EventTarget | null;
}): ScrollKeyIntent {
  if (isEditableTarget(event.target)) return null;
  const intent = classifyScrollKey(event);
  if (!intent) return null;
  if ((event.key === ' ' || event.key === 'Spacebar') && isSpaceActivatedTarget(event.target)) {
    return null;
  }
  return intent;
}

// The OS setting or the "Reduce motion" switch (`use-reduced-motion.ts`).
export { prefersReducedMotion } from './use-reduced-motion';
