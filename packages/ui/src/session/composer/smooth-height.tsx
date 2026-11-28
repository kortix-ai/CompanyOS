'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { prefersReducedMotion } from '../../internal/hooks/use-reduced-motion';
import { cn } from '../../lib/utils';

/** `duration-normal` plus a frame: past it a move has ended even if no `transitionend` came. */
const SETTLE_MS = 200;

/**
 * The stack above the composer card, with its height changes eased (KRTX-5238).
 *
 * Every layer docked here (a question, an approval, the queued messages, a notice) changes the
 * height of the transcript's viewport, and the transcript sits on the composer: an instant
 * change moved every line above it in one frame. Here the height follows the content over
 * `duration-normal`, so the transcript slides with it instead.
 *
 * The content is clipped only while the height moves: a docked question's ring reaches past
 * the stack, and a permanent clip would cut it. The first height is the content's, unanimated.
 * Reduced motion makes every change instant.
 */
export function SmoothHeight({ children }: { children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let last: number | null = null;
    const read = () => {
      const next = inner.offsetHeight;
      if (next === last) return;
      if (last !== null && !prefersReducedMotion()) {
        setMoving(true);
        clearTimeout(settle);
        settle = setTimeout(() => setMoving(false), SETTLE_MS);
      }
      last = next;
      setHeight(next);
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(inner);
    return () => {
      observer.disconnect();
      clearTimeout(settle);
    };
  }, []);

  return (
    <div
      data-smooth-height
      className={cn(
        'transition-[height] duration-normal ease-out motion-reduce:transition-none',
        moving && 'overflow-hidden',
      )}
      style={height === null ? undefined : { height }}
    >
      {/* `flow-root`: the layers' margins stay inside the measured box. */}
      <div ref={innerRef} className="flow-root">
        {children}
      </div>
    </div>
  );
}
