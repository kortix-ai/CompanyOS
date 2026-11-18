'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { HOOP_PALETTE } from './hoop-palette';

/** A viewport scrollbar that keeps window scrolling, anchors and the sticky header intact. */
export function HoopScrollbar() {
  const [metrics, setMetrics] = useState({ height: 0, thumb: 0, top: 0, max: 0, position: 0 });
  const drag = useRef<{ pointerId: number; offset: number } | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const root = document.documentElement;
      const height = root.clientHeight;
      const max = Math.max(0, root.scrollHeight - height);
      const thumb = Math.min(height, Math.max(32, height * height / root.scrollHeight));
      const position = Math.max(0, Math.min(max, window.scrollY));
      setMetrics({ height, thumb, max, position, top: max ? position / max * (height - thumb) : 0 });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  const scrollToPointer = (y: number) => {
    const { height, thumb, max } = metrics;
    const travel = height - thumb;
    if (travel > 0) window.scrollTo({ top: Math.max(0, Math.min(1, (y - (drag.current?.offset ?? thumb / 2)) / travel)) * max, behavior: 'instant' });
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const { top, thumb } = metrics;
    drag.current = { pointerId: event.pointerId, offset: event.clientY >= top && event.clientY <= top + thumb ? event.clientY - top : thumb / 2 };
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollToPointer(event.clientY);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { position, height, max } = metrics;
    const next = {
      ArrowDown: position + 40,
      ArrowUp: position - 40,
      PageDown: position + height * 0.9,
      PageUp: position - height * 0.9,
      Home: 0,
      End: max,
      ' ': position + height * 0.9 * (event.shiftKey ? -1 : 1),
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    window.scrollTo({ top: Math.max(0, Math.min(max, next)), behavior: 'instant' });
  };

  if (!metrics.max) return null;
  return (
    <>
      <style jsx global>{`
        html:has([data-loop-scrollbar]) { scrollbar-width: none; }
        html:has([data-loop-scrollbar])::-webkit-scrollbar { display: none; }
        @media (forced-colors: active) {
          [data-loop-scrollbar] { background: Canvas; }
          [data-loop-scrollbar-thumb] { background: CanvasText !important; }
        }
      `}</style>
      <div
        data-loop-scrollbar
        role="scrollbar"
        aria-label="Page scroll"
        aria-controls="loopmaxxing-content"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.round(metrics.max)}
        aria-valuenow={Math.round(metrics.position)}
        tabIndex={0}
        className="bg-background focus-visible:outline-ring fixed inset-y-0 right-0 z-40 w-3 touch-none cursor-pointer select-none focus-visible:outline-2 focus-visible:-outline-offset-2"
        onPointerDown={onPointerDown}
        onPointerMove={(event) => { if (drag.current?.pointerId === event.pointerId) scrollToPointer(event.clientY); }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}
        onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = null; }}
        onKeyDown={onKeyDown}
      >
        <div
          data-loop-scrollbar-thumb
          className="pointer-events-none absolute right-[3px] w-1.5 rounded-full"
          style={{
            height: metrics.thumb,
            transform: `translateY(${metrics.top}px)`,
            background: `linear-gradient(to bottom, ${HOOP_PALETTE[0]} 0% 25%, ${HOOP_PALETTE[3]} 25% 50%, ${HOOP_PALETTE[1]} 50% 75%, ${HOOP_PALETTE[2]} 75% 100%)`,
          }}
        />
      </div>
    </>
  );
}
