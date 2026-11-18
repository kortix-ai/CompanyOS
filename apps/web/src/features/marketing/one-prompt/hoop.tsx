'use client';

import { cn } from '@kortix/ui';
import type { CSSProperties } from 'react';

import { HOOP_PALETTE } from './hoop-palette';

/**
 * The hula hoop, Loopmaxxing's motif: its four colors used sparingly on a
 * black and white page. A hairline, a dot, a thin ring; never a fill and
 * never on the words. The colors live in `hoop-palette.ts`; components read
 * them as CSS variables (`--hoop-0` … `--hoop-3`) that `hoopVars` sets on the
 * page wrapper.
 */
export const hoopVars = Object.fromEntries(HOOP_PALETTE.map((color, index) => [`--hoop-${index}`, color])) as CSSProperties;

/** The color for an index, cycling red, blue, green, yellow. */
export function hoop(index: number): string {
  return `var(--hoop-${((index % HOOP_PALETTE.length) + HOOP_PALETTE.length) % HOOP_PALETTE.length})`;
}

/**
 * The hoop's segments as the toy has them: long and short pieces, never one
 * color twice in a row. `color` indexes the palette; lengths are percent.
 */
const SEGMENTS: ReadonlyArray<{ color: number; length: number }> = [
  { color: 3, length: 7 },
  { color: 2, length: 16 },
  { color: 1, length: 15 },
  { color: 0, length: 12 },
  { color: 2, length: 9 },
  { color: 0, length: 14 },
  { color: 1, length: 17 },
  { color: 0, length: 10 },
];

/** Where each segment starts on the ring, in percent. */
const STARTS = SEGMENTS.map((_, index) => SEGMENTS.slice(0, index).reduce((sum, segment) => sum + segment.length, 0));

/** The segments along an ellipse. */
function Segments({ cx, cy, rx, ry, width }: { cx: number; cy: number; rx: number; ry: number; width: number }) {
  return SEGMENTS.map((segment, index) => {
    const offset = -STARTS[index]!;
    return (
      <ellipse
        key={index}
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        pathLength={100}
        stroke={hoop(segment.color)}
        strokeWidth={width}
        strokeDasharray={`${segment.length} ${100 - segment.length}`}
        strokeDashoffset={offset}
      />
    );
  });
}

/** A ring seen from above: one O of the wordmark. It spins without end; the two O's turn opposite ways. */
function HoopRing({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" style={style} className={cn('shrink-0 animate-[spin_6s_linear_infinite] motion-reduce:animate-none', className)}>
      <Segments cx={50} cy={50} rx={40} ry={40} width={11} />
    </svg>
  );
}

/** LOOPMAXXING with its two O's as hoops. The caller's link carries `group/wordmark`. Screen readers read the word. */
export function LoopmaxxingWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span className="sr-only">Loopmaxxing</span>
      {/* The rings are sized in em, not on the spacing scale, so the word scales as one piece: the header's mark, the page's last line. */}
      <span aria-hidden className="inline-flex items-center">
        L
        <HoopRing style={{ width: '0.8em', height: '0.8em', marginLeft: '0.05em' }} />
        <HoopRing className="[animation-direction:reverse]" style={{ width: '0.8em', height: '0.8em', marginLeft: '-0.1em', marginRight: '0.05em' }} />
        PMAXXING
      </span>
    </span>
  );
}

/** A straight piece of hoop, a hairline: the segments side by side. A band's top edge. */
export function HoopLine({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex h-px', className)}>
      {SEGMENTS.map((segment, index) => (
        <span key={index} style={{ flexGrow: segment.length, background: hoop(segment.color) }} />
      ))}
    </div>
  );
}

/** A section's mark: four dots, one per hoop color. */
export function HoopDots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex items-center gap-1.5', className)}>
      {HOOP_PALETTE.map((_, index) => (
        <span key={index} className="size-1.5 rounded-full" style={{ background: hoop(index) }} />
      ))}
    </span>
  );
}
