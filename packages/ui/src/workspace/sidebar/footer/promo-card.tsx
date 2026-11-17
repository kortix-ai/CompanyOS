'use client';

import { ArrowRightIcon, XIcon } from '@phosphor-icons/react';
import { useId, useState, type ReactNode } from 'react';

import Loading from '../../../primitives/loading';
import { BeamsStill } from '../../../primitives/paper-wallpaper-shaders';
import { cn } from '../../../internal/lib/utils';

/** One promo the switcher can show. */
export interface PromoSlide {
  /** Stable key, also the dot's identity. */
  id: string;
  /** The art row: a few `PromoMark` tiles. */
  marks: ReactNode;
  title: string;
  description: string;
  cta: string;
  dismissLabel: string;
  onDismiss: () => void;
  onClick: () => void;
  pending?: boolean;
}

/**
 * The sidebar's advertisements, one card at a time. Every slide is a card: an
 * art header with a row of marks, a title, one sentence and a call to action.
 * The header is the still of the art in the dialog the card opens, dimmed,
 * with the marks floating on it, so the click lands where the card promised.
 *
 * All slides share one grid cell, so the card is as tall as its tallest slide
 * and switching never moves the session list above. The dots switch by hand;
 * nothing rotates on its own, because the sidebar is always on screen. A
 * dismissed slide leaves, and the next one takes its place.
 *
 * In flow, so a border and no shadow (effects.md); hover is color only. On a
 * window under 52rem tall the sentence folds away.
 */
export function PromoSwitcher({ slides, label }: { slides: readonly PromoSlide[]; label: string }) {
  const id = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  if (slides.length === 0) return null;
  // The chosen slide, or the first one when it was dismissed or none was chosen.
  const active = slides.find((slide) => slide.id === activeId) ?? slides[0];

  return (
    <li
      className="group/promo relative list-none"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="grid">
        {slides.map((slide) => {
          const current = slide.id === active.id;
          return (
            <button
              key={slide.id}
              type="button"
              disabled={slide.pending}
              aria-busy={slide.pending || undefined}
              aria-labelledby={`${id}-${slide.id}-title`}
              aria-describedby={`${id}-${slide.id}-description`}
              inert={!current}
              onClick={slide.onClick}
              className={cn(
                'bg-background border-border hover:bg-hover focus-visible:ring-ring col-start-1 row-start-1 flex w-full cursor-pointer flex-col overflow-hidden rounded-md border text-left transition-[background-color,opacity] duration-moderate outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none',
                !current && 'pointer-events-none opacity-0',
              )}
            >
              {/* Dark in both themes, like every art pane. */}
              <span
                aria-hidden="true"
                className="dark bg-background relative isolate flex h-16 w-full shrink-0 items-center justify-center gap-4 border-b"
              >
                <BeamsStill />
                {/* Dims the beams to near-black, so the marks float on a calm ground. */}
                <span className="bg-background/50 absolute inset-0" />
                {slide.marks}
              </span>
              <span className="flex flex-1 flex-col gap-2 p-3">
                <span className="space-y-1">
                  <span
                    id={`${id}-${slide.id}-title`}
                    className="text-foreground block text-sm leading-snug font-medium text-balance"
                  >
                    {slide.title}
                  </span>
                  <span
                    id={`${id}-${slide.id}-description`}
                    className="text-muted-foreground block text-xs leading-relaxed text-pretty [@media(max-height:52rem)]:hidden"
                  >
                    {slide.description}
                  </span>
                </span>
                {/* Pinned to the foot, level with the dots, whatever the slide's length. */}
                <span className="text-foreground mt-auto inline-flex items-center gap-1 text-xs font-medium">
                  {slide.pending ? <Loading className="size-3.5 shrink-0" /> : null}
                  {slide.cta}
                  {slide.pending ? null : <ArrowRightIcon className="size-3 shrink-0" />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {/* On the art, so it takes the art's dark scope. It dismisses the slide
          on show. */}
      <button
        type="button"
        onClick={active.onDismiss}
        aria-label={active.dismissLabel}
        className="text-muted-foreground hover:bg-active hover:text-foreground focus-visible:ring-ring dark absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-sm opacity-0 transition-[color,background-color,opacity] duration-fast outline-none group-focus-within/promo:opacity-100 group-hover/promo:opacity-100 focus-visible:ring-2 max-md:opacity-100"
      >
        <XIcon className="size-3.5" />
      </button>
      {slides.length > 1 ? (
        <div className="absolute right-2 bottom-2 flex items-center">
          {slides.map((slide) => {
            const current = slide.id === active.id;
            return (
              <button
                key={slide.id}
                type="button"
                aria-label={slide.title}
                aria-current={current || undefined}
                onClick={() => setActiveId(slide.id)}
                className="group/dot focus-visible:ring-ring flex size-6 cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-2"
              >
                <span
                  className={cn(
                    // Color only: the crossfade above is the one thing that moves.
                    'h-1.5 rounded-full transition-colors duration-fast',
                    current
                      ? 'bg-foreground w-4'
                      : 'bg-muted-foreground/40 group-hover/dot:bg-muted-foreground w-1.5',
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}

/**
 * One mark on a card's art, with no tile: white under the art's `dark` scope
 * (`text-foreground`) unless it carries its own brand colors.
 */
export function PromoMark({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span title={label} className="text-foreground relative flex shrink-0 items-center justify-center">
      {children}
    </span>
  );
}
