'use client';

import { ArrowRightIcon, XIcon } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';

import Loading from '../../../primitives/loading';
import { BeamsStill } from '../../../primitives/paper-wallpaper-shaders';

/**
 * A sidebar advertisement with room to sell: an art header with a row of
 * marks, a title, one sentence of what it does, and a call to action. The
 * header is the same beams art as the dialog the card opens, so the click
 * lands where the card promised.
 *
 * The whole card is the button. The dismiss sits on top of it, outside the
 * button, so a click on the X never opens the dialog. In flow, so a border
 * and no shadow (effects.md); hover is color only. On a window under 52rem
 * tall the sentence folds away, so the session list above keeps its room.
 */
export function PromoCard({
  marks,
  title,
  description,
  cta,
  dismissLabel,
  onDismiss,
  onClick,
  pending = false,
}: {
  /** The art row: a few `PromoMark` tiles. */
  marks: ReactNode;
  title: string;
  description: string;
  cta: string;
  dismissLabel: string;
  onDismiss: () => void;
  onClick: () => void;
  pending?: boolean;
}) {
  // The title names the button; the sentence describes it.
  const id = useId();
  return (
    <li className="group/promo relative list-none">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={onClick}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="bg-background border-border hover:bg-hover focus-visible:ring-ring flex w-full cursor-pointer flex-col overflow-hidden rounded-md border text-left transition-colors duration-fast outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60"
      >
        {/* Dark in both themes, like every art pane. */}
        <span
          aria-hidden="true"
          className="dark bg-background relative isolate flex h-16 w-full items-center justify-center gap-1.5 border-b"
        >
          <BeamsStill />
          {marks}
        </span>
        <span className="flex flex-col gap-2 p-3">
          <span className="space-y-1">
            <span id={`${id}-title`} className="text-foreground block text-sm leading-snug font-medium text-balance">
              {title}
            </span>
            <span id={`${id}-description`} className="text-muted-foreground block text-xs leading-relaxed text-pretty [@media(max-height:52rem)]:hidden">
              {description}
            </span>
          </span>
          <span className="text-foreground inline-flex items-center gap-1 text-xs font-medium">
            {pending ? <Loading className="size-3.5 shrink-0" /> : null}
            {cta}
            {pending ? null : <ArrowRightIcon className="size-3 shrink-0" />}
          </span>
        </span>
      </button>
      {/* On the art, so it takes the art's dark scope. */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="text-muted-foreground hover:bg-active hover:text-foreground focus-visible:ring-ring dark absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-sm opacity-0 transition-[color,background-color,opacity] duration-fast outline-none group-focus-within/promo:opacity-100 group-hover/promo:opacity-100 focus-visible:ring-2 max-md:opacity-100"
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  );
}

/**
 * One tile on a card's art: white in both themes (`bg-foreground` under the
 * art's `dark` scope), the mark inked black (`text-background`) unless it
 * carries its own brand colors.
 */
export function PromoMark({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span
      title={label}
      className="bg-foreground text-background relative flex size-9 shrink-0 items-center justify-center rounded-md shadow-md"
    >
      {children}
    </span>
  );
}
