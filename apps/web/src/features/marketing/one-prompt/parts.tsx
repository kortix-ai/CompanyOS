'use client';

import { SETUP_PROMPT } from '@kortix/shared/setup-guide';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { Codex } from '@kortix/ui/internal/icons/codex';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const COPIED_MS = 2000;

export function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // Nothing reached the clipboard: claim nothing.
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };
  return { copied, copy };
}

export function CopyButton({ size = 'md', text = SETUP_PROMPT, label = 'Copy the prompt' }: { size?: 'sm' | 'md'; text?: string; label?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'bg-kortix-base hover:bg-kortix-base/90 rounded-md font-medium text-white transition-colors',
        size === 'md' ? 'h-9 px-4 text-sm' : 'h-8 px-3 text-sm',
      )}
    >
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}

export function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="border-border bg-card text-foreground hover:bg-accent inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors">
      {children}
    </Link>
  );
}

/** A product name with its mark, inline in running text (founder call 2026-11-10: Claude and Codex show their logos). */
export function Mark({ name }: { name: 'Claude' | 'Codex' | 'Claude Code' }) {
  const Icon = name === 'Codex' ? Codex : Claude;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-[1em] shrink-0" />
      {name}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{children}</span>;
}


export function Window({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('border-border bg-background overflow-hidden rounded-lg border shadow-2xl shadow-black/40', className)}>
      <div className="border-border text-muted-foreground flex items-center gap-3 border-b px-4 py-2.5 text-xs">
        <span aria-hidden className="flex gap-1.5">
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}

export function Chips({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={cn('rounded-full border px-2.5 py-1 text-xs', accent ? 'border-kortix-base/30 text-kortix-base' : 'border-border text-muted-foreground')}>
          {item}
        </span>
      ))}
    </div>
  );
}
