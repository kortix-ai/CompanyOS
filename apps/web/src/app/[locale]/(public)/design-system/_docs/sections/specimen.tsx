'use client';

import { cn } from '@kortix/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Type specimens for the typography pages (fonts, headings, text, caption,
 * code). A row is the rendered sample on the left and its classes on the
 * right, with the size, line height and weight the browser computed under
 * them. Nothing here holds a value: the readout is measured at runtime.
 */

/** The preview layout for a stack of specimen rows: flush, one row per line. */
export const SPECIMEN_PREVIEW = 'flex-col flex-nowrap items-stretch gap-0 p-0';

function measure(el: Element): string {
  const cs = getComputedStyle(el);
  const size = Math.round(parseFloat(cs.fontSize) * 100) / 100;
  const lh = parseFloat(cs.lineHeight);
  const line = Number.isNaN(lh) ? cs.lineHeight : `${Math.round(lh * 100) / 100}px`;
  return `${size}px / ${line} · ${cs.fontWeight}`;
}

/**
 * One specimen row. `children` is the sample element; it is hidden from
 * assistive tech, so a sample heading does not join the page outline. The
 * classes and the measured metrics on the right stay readable.
 */
export function Specimen({
  label,
  meta,
  note,
  children,
  className,
}: {
  /** The row name, shown above the classes ("Heading 1"). */
  label?: string;
  /** The classes or prop the row demonstrates. */
  meta: string;
  /** One line on where the row is used. */
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState('');
  useEffect(() => {
    const el = ref.current?.firstElementChild ?? ref.current;
    if (!el) return;
    setMetrics(measure(el));
    if (typeof document === 'undefined' || !document.fonts) return;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setMetrics(measure(el));
    });
    return () => {
      live = false;
    };
  }, [meta]);

  return (
    <div
      className={cn(
        'border-border flex flex-col gap-2 border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div ref={ref} aria-hidden className="min-w-0 flex-1">
        {children}
      </div>
      <div className="flex min-w-0 shrink-0 flex-col gap-0.5 sm:max-w-64 sm:items-end sm:text-end">
        {label && <span className="text-foreground text-xs font-medium">{label}</span>}
        <span className="text-muted-foreground font-mono text-xs break-words">{meta}</span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">{metrics || '…'}</span>
        {note && <span className="text-muted-foreground text-xs text-pretty">{note}</span>}
      </div>
    </div>
  );
}

/** The JSX for a list of `{ tag, className, text }` samples, one per line. */
export function specimenCode(rows: ReadonlyArray<{ tag: string; className: string; text: string }>): string {
  return rows.map((r) => `<${r.tag} className="${r.className}">${r.text}</${r.tag}>`).join('\n');
}
