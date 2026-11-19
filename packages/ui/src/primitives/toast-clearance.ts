'use client';

import { type RefObject, useEffect } from 'react';

/**
 * Keeps bottom-right toasts clear of a composer docked at the bottom of the
 * window. The app's `<Toaster>` reads its bottom offset from
 * `--toast-offset-bottom` (`apps/web/src/app/[locale]/layout.tsx`); a docked
 * composer sets that variable to the distance from its top edge to the window
 * bottom while it reaches into the toast lane. Before this, a toast covered the
 * session composer's Send/Stop button (dev audit, 2026-11-14).
 *
 * Toasts always stay in the window's bottom-right corner. They never follow
 * the composer sideways: right-aligning them with the composer pinned them
 * inside the chat column, away from the corner.
 */
export const TOAST_OFFSET_VAR = '--toast-offset-bottom';

/** Sonner's default edge offset on desktop. */
const EDGE_PX = 24;
/** Sonner's toast width. */
const TOAST_WIDTH_PX = 356;
/** The element whose resize moves a docked composer (the chat column). */
export const TOAST_ANCHOR_ATTR = 'data-toast-anchor';

/** Sonner stacks toasts full width at and below this viewport width. */
const MOBILE_BREAKPOINT_PX = 600;
/** Space between the composer's top edge and the lowest toast. */
const GAP_PX = 12;
/** A composer whose bottom edge is this close to the window bottom is docked there. */
const DOCKED_BOTTOM_PX = 160;

export interface ClearanceRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/**
 * The bottom offset that puts a corner toast just above `rect`, or 0 when the
 * element is hidden, not docked at the window bottom, or entirely left of the
 * toast lane (the window's right 380px). A tall composer (long draft,
 * attachments) still counts: only its bottom edge says whether it is docked.
 */
export function toastClearance(rect: ClearanceRect, viewport: { width: number; height: number }): number {
  if (rect.width === 0 || rect.height === 0) return 0;
  if (viewport.height - rect.bottom > DOCKED_BOTTOM_PX) return 0;
  const laneLeft = viewport.width <= MOBILE_BREAKPOINT_PX ? 0 : viewport.width - EDGE_PX - TOAST_WIDTH_PX;
  const laneRight = viewport.width <= MOBILE_BREAKPOINT_PX ? viewport.width : viewport.width - EDGE_PX;
  if (rect.right <= laneLeft || rect.left >= laneRight) return 0;
  return Math.max(0, Math.ceil(viewport.height - rect.top + GAP_PX));
}

// replica-local: one entry per mounted docked composer in this window.
const clearances = new Map<symbol, number>();

function apply(): void {
  if (typeof document === 'undefined') return;
  // The composer that lifts the toast highest decides the offset.
  let bottom = 0;
  for (const c of clearances.values()) if (c > bottom) bottom = c;
  const root = document.documentElement.style;
  if (bottom > 0) root.setProperty(TOAST_OFFSET_VAR, `${bottom}px`);
  else root.removeProperty(TOAST_OFFSET_VAR);
}

/** Registers `ref`'s element as a docked composer while `active`. */
export function useToastClearance(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof window === 'undefined') return;
    const id = Symbol('toast-clearance');
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const bottom = toastClearance(rect, { width: window.innerWidth, height: window.innerHeight });
      if (clearances.get(id) === bottom) return;
      clearances.set(id, bottom);
      apply();
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    // The composer is width-capped and centered, so a side panel opening
    // MOVES it without resizing it. The column it sits in (marked with
    // `data-toast-anchor`) does resize, so watch that too, or the lane check
    // keeps the pre-panel position.
    const anchor = el.closest(`[${TOAST_ANCHOR_ATTR}]`);
    if (anchor) observer?.observe(anchor);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      clearances.delete(id);
      apply();
    };
  }, [ref, active]);
}
