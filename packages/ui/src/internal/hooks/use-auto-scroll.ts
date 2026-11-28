'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BOTTOM_GAP_PX,
  OWN_SCROLL_MS,
  chevronVisible,
  isAtEnd,
  keyScrollIntentFor,
  prefersReducedMotion,
  shouldReleaseFollow,
} from './use-auto-scroll-physics';

export {
  AT_END_PX,
  BOTTOM_GAP_PX,
  CHEVRON_PX,
  OWN_SCROLL_MS,
  chevronVisible,
  classifyScrollKey,
  isAtEnd,
  isEditableTarget,
  isSpaceActivatedTarget,
  keyScrollIntentFor,
  shouldReleaseFollow,
} from './use-auto-scroll-physics';
export type { ScrollKeyIntent } from './use-auto-scroll-physics';

/**
 * useAutoScroll — the session transcript sits on the composer, like a chat.
 *
 * THE END. The content ends with a fixed gap (`BOTTOM_GAP_PX`, `spacerElRef`) and nothing else:
 * no room that grows while the agent works and shrinks when it stops, so nothing above the end
 * moves at a turn start, a turn end, a send, or a report from another agent. Content only grows
 * at the end; a following viewport keeps the end in view.
 *
 * THE RULE — follow. `follow` is true when the reader is at the end. While it is true, every
 * layout change (content grew, a row folded, the viewport resized) puts the viewport back at the
 * end in the same observer callback, so the newest line never leaves the screen. `follow`
 * becomes false on READER intent — a wheel, touch or keyboard scroll up — and true again when
 * the reader comes back to the end (wheel, touch, keys, the chevron) or sends. Keys are read on
 * `document`: the transcript is not focusable, so a key that scrolls it is never delivered to it.
 *
 * It also becomes false for a scroll AWAY from the end that this hook did not make and that no
 * layout change explains (`shouldReleaseFollow`): find-in-page, `scrollIntoView` and a test
 * driver move the viewport without an input event, and following through one of those puts the
 * reader straight back. Our own writes are tagged, and a scroll whose `scrollHeight` or
 * `clientHeight` changed in the same breath is a clamp, never intent.
 *
 * THE MOTION. Following is an instant write: a smooth one would lag streamed text. The chevron
 * glides to the end once; a change that moves the end during that glide re-aims it.
 *
 * Direct DOM writes only (`el.scrollTop`) — never React state on the hot path. The one piece of
 * state is the chevron.
 */

/** How long the chevron's glide owns the viewport: settles re-aim it instead of cutting it. */
const GLIDE_MS = 600;

interface UseAutoScrollOptions {
  /** True once the scroll area is mounted with content — the refs are null until then (the
   *  area is conditionally rendered), so the observers and listeners attach on this edge. */
  hasContent?: boolean;
}

interface UseAutoScrollReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** The fixed gap under the last turn; the content's only bottom padding. */
  spacerElRef: React.RefObject<HTMLDivElement | null>;
  showScrollButton: boolean;
  /** Go to the end now (instant) and follow from here. */
  scrollToBottom: () => void;
  /** The chevron: glide to the end and follow from here. */
  smoothScrollToAbsoluteBottom: () => void;
  /** A send: follow from here. The sent message lands at the end, above the composer. */
  anchorTurn: (turnId: string) => void;
  /** Open at the TOP and stay there (a sub-session viewed from its start): follow is off until
   *  the reader comes to the end themselves. */
  startAtTop: () => void;
}

function distanceFromEnd(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

export function useAutoScroll({ hasContent = false }: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const spacerElRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  /** THE RULE's one bit. Starts true: a session opens at its end. */
  const followRef = useRef(true);
  /** Until when the chevron's glide owns the viewport. */
  const glideUntilRef = useRef(0);
  /** Until when a `scroll` event is OUR OWN write rather than something that moved the viewport
   *  out from under us (`shouldReleaseFollow`). A window, not a boolean: a `scrollTop` write is
   *  delivered as an event on a later frame. */
  const ownScrollUntilRef = useRef(0);
  const markOwnScroll = useCallback((ms: number) => {
    ownScrollUntilRef.current = Math.max(ownScrollUntilRef.current, performance.now() + ms);
  }, []);

  /** The one bit, with its reason, mirrored onto the scroll element as `data-follow` /
   *  `data-follow-why`, so "why did it stop following?" is never a guess. */
  const setFollow = useCallback((next: boolean, why: string) => {
    followRef.current = next;
    const el = scrollRef.current;
    if (el) {
      el.dataset.follow = String(next);
      el.dataset.followWhy = why;
    }
  }, []);

  /** Put a following viewport at the end. */
  const settle = useCallback(() => {
    const el = scrollRef.current;
    const spacer = spacerElRef.current;
    if (spacer && spacer.style.height !== `${BOTTOM_GAP_PX}px`) spacer.style.height = `${BOTTOM_GAP_PX}px`;
    if (!el || !followRef.current) return;
    const end = el.scrollHeight - el.clientHeight;
    if (Math.abs(el.scrollTop - end) <= 0.5) return;
    if (performance.now() < glideUntilRef.current) {
      markOwnScroll(GLIDE_MS);
      el.scrollTo({ top: end, behavior: 'smooth' });
      return;
    }
    markOwnScroll(OWN_SCROLL_MS);
    el.scrollTop = end;
  }, [markOwnScroll]);

  const goToEnd = useCallback(
    (behavior: ScrollBehavior, why: string) => {
      const el = scrollRef.current;
      setFollow(true, why);
      setShowScrollButton(false);
      if (!el) return;
      const end = el.scrollHeight - el.clientHeight;
      if (behavior === 'smooth' && !prefersReducedMotion()) {
        glideUntilRef.current = performance.now() + GLIDE_MS;
        markOwnScroll(GLIDE_MS);
        el.scrollTo({ top: end, behavior: 'smooth' });
        return;
      }
      glideUntilRef.current = 0;
      markOwnScroll(OWN_SCROLL_MS);
      el.scrollTop = end;
    },
    [setFollow, markOwnScroll],
  );

  const scrollToBottom = useCallback(() => goToEnd('auto', 'end'), [goToEnd]);
  const smoothScrollToAbsoluteBottom = useCallback(() => goToEnd('smooth', 'chevron'), [goToEnd]);
  const anchorTurn = useCallback(() => goToEnd('auto', 'send'), [goToEnd]);
  const startAtTop = useCallback(() => {
    const el = scrollRef.current;
    setFollow(false, 'start-at-top');
    if (el) {
      glideUntilRef.current = 0;
      markOwnScroll(OWN_SCROLL_MS);
      el.scrollTop = 0;
    }
  }, [setFollow, markOwnScroll]);

  // ── Layout observers: content + viewport → settle ──────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    // ResizeObserver fires after layout for the content box (text streamed, a row appeared or
    // folded, an image loaded) and the viewport (panel resized, composer grew). A DOM change
    // that keeps the content box's size changes no end, so no MutationObserver is needed.
    const ro = new ResizeObserver(() => settle());
    ro.observe(content);
    ro.observe(el);
    settle();
    return () => ro.disconnect();
  }, [settle, hasContent]);

  // ── Reader intent ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const leaveEnd = (why: string) => {
      if (!followRef.current) return;
      glideUntilRef.current = 0;
      setFollow(false, why);
    };
    const updateChevron = () => {
      if (followRef.current) {
        setShowScrollButton(false);
        return;
      }
      setShowScrollButton(chevronVisible(distanceFromEnd(el) - BOTTOM_GAP_PX));
    };
    const maybeResume = (why: string) => {
      if (isAtEnd(distanceFromEnd(el))) {
        setFollow(true, why);
        setShowScrollButton(false);
      }
    };

    // Wheel: up = intent to leave; down = intent, and resumes at the end.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) leaveEnd('wheel-up');
      requestAnimationFrame(() => {
        if (e.deltaY > 0) maybeResume('wheel-down');
        updateChevron();
      });
    };
    // Touch: any move is intent; a downward swipe that reaches the end resumes.
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dy = touchStartY - (e.touches[0]?.clientY ?? 0);
      if (dy < -6) leaveEnd('touch-up');
      requestAnimationFrame(() => {
        if (dy > 6) maybeResume('touch-down');
        updateChevron();
      });
    };
    // Keyboard scrolling, on `document` in the capture phase: the transcript carries no
    // tabindex, so the browser delivers the key to <body> or to whatever holds focus.
    const onKeyDown = (e: KeyboardEvent) => {
      // A session tab kept mounted but off-screen (`hidden`) must not react to a key aimed at
      // the visible transcript.
      if (el.clientHeight === 0) return;
      const intent = keyScrollIntentFor(e);
      if (!intent) return;
      if (intent === 'end') {
        // "Go to the end": a transcript that is still growing moves the end away from the
        // browser's own animation, so the reader would press End and never get follow back.
        goToEnd('auto', 'key-end');
        return;
      }
      if (intent === 'up') leaveEnd('key-up');
      requestAnimationFrame(() => {
        if (intent === 'down') maybeResume('key-down');
        updateChevron();
      });
    };
    // Scroll: NOT an intent signal. The transcript hides its scrollbar, so every reader scroll
    // arrives as wheel, touch or keys above; what reaches this listener is our own writes, the
    // browser clamping `scrollTop` when content shrinks, and tools that move the viewport.
    let lastTop = el.scrollTop;
    let lastScrollHeight = el.scrollHeight;
    let lastClientHeight = el.clientHeight;
    const onScroll = () => {
      const top = el.scrollTop;
      const movedTowardEnd = top >= lastTop;
      const geometryChanged = el.scrollHeight !== lastScrollHeight || el.clientHeight !== lastClientHeight;
      lastTop = top;
      lastScrollHeight = el.scrollHeight;
      lastClientHeight = el.clientHeight;
      // Never fight a scroll we did not make. See `shouldReleaseFollow`.
      if (
        shouldReleaseFollow({
          following: followRef.current,
          ours: performance.now() < ownScrollUntilRef.current,
          geometryChanged,
          distanceFromEnd: distanceFromEnd(el),
        })
      ) {
        setFollow(false, 'scroll-away');
      }
      // Re-arm only when the viewport ARRIVED at the end moving toward it: the first frame of a
      // keyboard scroll up is 2-3px off the end, inside AT_END_PX.
      if (!followRef.current && movedTowardEnd && isAtEnd(distanceFromEnd(el))) {
        setFollow(true, 'scroll-to-end');
      }
      updateChevron();
    };
    el.dataset.follow = String(followRef.current);

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('keydown', onKeyDown, { capture: true, passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('keydown', onKeyDown, { capture: true });
      el.removeEventListener('scroll', onScroll);
    };
  }, [goToEnd, hasContent, setFollow]);

  return {
    scrollRef,
    contentRef,
    spacerElRef,
    showScrollButton,
    scrollToBottom,
    smoothScrollToAbsoluteBottom,
    anchorTurn,
    startAtTop,
  };
}
