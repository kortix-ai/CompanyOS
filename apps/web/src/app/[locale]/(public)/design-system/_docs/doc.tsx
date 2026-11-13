'use client';

import { cn } from '@kortix/ui';
import { CodeBlock, HighlightedCode } from '@kortix/ui/markdown';
import { CopyButton } from '@kortix/ui/markdown/copy-button';
import { CaretRightIcon } from '@phosphor-icons/react';
import { useId, useState, type ReactNode } from 'react';

import { useDocNav } from './doc-nav';
import { DOC_ENTRIES } from './nav';

/**
 * The parts every /design-system page is made of. A page is a title, then
 * sections; a section is a title, then one or more `Example`s. An Example is a
 * live preview over a "Show code" fold that holds the exact JSX it renders.
 */

export function DocPage({
  title,
  lead,
  children,
  wide = false,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  /** A wider column, for a component that needs room to show its layout (Split Sheet). */
  wide?: boolean;
}) {
  return (
    <article className={cn('mx-auto w-full px-5 pt-12 pb-16 sm:px-8 lg:pt-16', wide ? 'max-w-5xl' : 'max-w-3xl')}>
      <header className="border-border mb-10 border-b pb-8">
        <h1 className="text-xl font-medium">{title}</h1>
        {lead && <p className="text-muted-foreground mt-2 max-w-xl text-sm text-pretty">{lead}</p>}
      </header>
      <div className="flex flex-col gap-12">{children}</div>
      <PrevNext />
    </article>
  );
}

export function DocSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="text-base font-medium">
          {title}
        </h2>
        {description && <p className="text-muted-foreground mt-1 text-sm text-pretty">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * A live preview over a "Show code" fold. `previewClassName` sets the preview
 * layout (the default is a wrapping row). `bleed` drops the preview padding,
 * for a preview that paints its own edge to edge (a logo on a ground).
 */
export function Example({
  code,
  language = 'tsx',
  children,
  previewClassName,
  bleed = false,
}: {
  code: string;
  language?: string;
  children: ReactNode;
  previewClassName?: string;
  bleed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const codeId = useId();
  const trimmed = code.trim();

  return (
    <div className="bg-popover border-border overflow-hidden rounded-md border">
      <div
        className={cn(
          bleed ? 'flex flex-col gap-1 p-1' : 'flex min-h-24 flex-wrap items-center gap-3 p-4',
          previewClassName,
        )}
      >
        {children}
      </div>
      <div className="bg-secondary m-1 mt-0 overflow-hidden rounded-sm">
        <div className="flex h-9 items-center gap-2 ps-3 pe-1.5">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={codeId}
            onClick={() => setOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-start text-sm transition-colors duration-fast ease-out"
          >
            <CaretRightIcon
              aria-hidden
              className={cn(
                'size-3.5 shrink-0 transition-transform duration-moderate ease-out motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
            {open ? 'Hide code' : 'Show code'}
          </button>
          <CopyButton code={trimmed} size="sm" label="Copy code" />
        </div>
        {open && (
          <pre
            id={codeId}
            className="border-border max-h-96 overflow-auto border-t px-4 py-3 font-mono text-xs leading-relaxed"
          >
            <HighlightedCode code={trimmed} language={language} />
          </pre>
        )}
      </div>
    </div>
  );
}

/** A code sample with no preview: the product's code block (CodeBlock), as chat renders it. */
export function CodeSample({ code, language = 'tsx', title }: { code: string; language?: string; title?: string }) {
  const trimmed = code.trim();
  return (
    <CodeBlock code={trimmed} language={title ?? language} className="my-0">
      <HighlightedCode code={trimmed} language={language} />
    </CodeBlock>
  );
}

/** A label over a value, for token rows: "Medium" over "28px · px 10 · r 6". */
export function TokenLabel({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-sm font-medium">{name}</span>
      <span className="text-muted-foreground truncate font-mono text-xs">{value}</span>
    </div>
  );
}

function PrevNext() {
  const { active, select } = useDocNav();
  const index = DOC_ENTRIES.findIndex((e) => e.slug === active);
  if (index < 0) return null;
  const prev = DOC_ENTRIES[index - 1];
  const next = DOC_ENTRIES[index + 1];
  const card =
    'border-border hover:bg-hover flex cursor-pointer flex-col gap-0.5 rounded-md border px-4 py-3 transition-colors duration-fast ease-out';

  return (
    <nav aria-label="Topics" className="border-border mt-16 grid grid-cols-2 gap-3 border-t pt-8">
      {prev ? (
        <button type="button" onClick={() => select(prev.slug)} className={`${card} items-start text-start`}>
          <span className="text-muted-foreground text-xs">Previous</span>
          <span className="text-sm font-medium">{prev.title}</span>
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button type="button" onClick={() => select(next.slug)} className={`${card} items-end text-end`}>
          <span className="text-muted-foreground text-xs">Next</span>
          <span className="text-sm font-medium">{next.title}</span>
        </button>
      ) : (
        <span />
      )}
    </nav>
  );
}
