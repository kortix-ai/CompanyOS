'use client';

import { PROD_TARGET, setupPromptFor, setupTarget, type SetupTarget } from '@kortix/shared/setup-guide';
import { Copy } from '@kortix/ui/icons';
import { MarketingButton } from '@/features/marketing/kit/marketing-button';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { Codex } from '@kortix/ui/internal/icons/codex';
import { cn } from '@kortix/ui';
import { CheckIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

const COPIED_MS = 2000;

const noSubscription = () => () => {};

/**
 * The deployment this page is served from: a prompt copied on dev.kortix.com or
 * localhost points at that deployment's own guide, so it is testable there.
 * The server render uses production; the browser corrects it after hydration.
 */
export function useSetupTarget(): SetupTarget {
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => PROD_TARGET.origin);
  return useMemo(() => setupTarget(origin), [origin]);
}

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

/**
 * The page's one action: copy the setup prompt. A light pill on the dark page,
 * the copy mark turning into a check for two seconds once the text is on the clipboard.
 */
export function CopyButton({
  size = 'md',
  tone = 'light',
  text,
  label = 'Copy prompt',
}: {
  size?: 'sm' | 'md' | 'lg';
  /** `dark`: the pill for a light card. */
  tone?: 'light' | 'dark';
  text?: string;
  label?: string;
}) {
  const target = useSetupTarget();
  const { copied, copy } = useCopy(text ?? setupPromptFor(target));
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors active:scale-[0.96] motion-reduce:active:scale-100',
        tone === 'light' ? 'bg-foreground text-background hover:bg-foreground/90' : 'bg-background text-foreground hover:bg-background/90',
        size === 'lg' && 'h-10 px-5 text-sm',
        size === 'md' && 'h-9 px-4 text-sm',
        size === 'sm' && 'h-8 px-3.5 text-sm',
      )}
    >
      {copied ? <CheckIcon className="size-4" /> : <Copy className="size-4" />}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}

/** Copy prompt as the site's closing button: the same button the footer call to action uses on every page. */
export function CopyPromptMarketingButton({ text, className }: { text: string; className?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <MarketingButton variant="accent" size="md" className={className} onClick={copy}>
      {copied ? <CheckIcon /> : <Copy />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy prompt'}</span>
    </MarketingButton>
  );
}

export function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors">
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
