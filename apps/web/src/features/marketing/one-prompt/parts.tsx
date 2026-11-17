'use client';

import { PROD_TARGET, setupPromptFor, setupTarget, type SetupTarget } from '@kortix/shared/setup-guide';
import { MarketingButton } from '@/features/marketing/kit/marketing-button';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { SolidCheckIcon } from '@kortix/ui/internal/icons/solid-check-icon';
import { Kbd } from '@kortix/ui/kbd';
import { Codex } from '@kortix/ui/internal/icons/codex';
import { cn } from '@kortix/ui';
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

/**
 * The page is always dark, whatever theme the reader picked elsewhere on the
 * site. The wrapper wears `.dark`, and while the page is mounted the root
 * element does too, so the overscroll area, the scrollbars and every portal
 * (menus, tooltips) are dark as well. The reader's stored choice is never
 * changed; leaving the page puts the root back as it was.
 */
export function useForceDarkPage() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const hadLight = root.classList.contains('light');
    const scheme = root.style.colorScheme;
    const apply = () => {
      if (!root.classList.contains('dark')) root.classList.add('dark');
      if (root.classList.contains('light')) root.classList.remove('light');
      if (root.style.colorScheme !== 'dark') root.style.colorScheme = 'dark';
    };
    apply();
    // The theme provider rewrites the root class when the theme changes: put dark back.
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => {
      observer.disconnect();
      root.classList.toggle('dark', hadDark);
      root.classList.toggle('light', hadLight);
      root.style.colorScheme = scheme;
    };
  }, []);
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
/** The key that copies the prompt from anywhere on the page. */
const COPY_KEY = 'c';

/** True when a key press belongs to something the reader is typing into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function CopyButton({
  size = 'md',
  variant = 'accent',
  text,
  label = 'Copy prompt',
  icon = 'none',
}: {
  /** `sm` is for the header only, as on the site navbar. */
  size?: 'sm' | 'md';
  /** The landing button's variants: `accent` is the page's main action. */
  variant?: 'primary' | 'secondary' | 'accent';
  text?: string;
  label?: string;
  /** What follows the label: nothing (a check once copied), or the page-wide key that copies (only one button should take it). */
  icon?: 'none' | 'shortcut';
}) {
  const target = useSetupTarget();
  const { copied, copy } = useCopy(text ?? setupPromptFor(target));
  const copyRef = useRef(copy);
  useEffect(() => {
    copyRef.current = copy;
  });
  useEffect(() => {
    if (icon !== 'shortcut') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== COPY_KEY || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      void copyRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [icon]);
  return (
    <MarketingButton
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      aria-keyshortcuts={icon === 'shortcut' ? COPY_KEY.toUpperCase() : undefined}
      // The key sits as far from the right edge as from the top and bottom: (h-10 - size-5) / 2.
      className={cn(size === 'md' && 'hit-area-y-1', icon === 'shortcut' && 'pr-2.5')}
    >
      {/* The label never changes; the trailing mark turns into a check, and a reader hears "Copied". */}
      <span>{label}</span>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
      {icon === 'none' && copied ? <SolidCheckIcon aria-hidden className="size-4" /> : null}
      {icon === 'shortcut' ? copied ? <SolidCheckIcon aria-hidden className="size-5!" /> : <Kbd className="bg-background/20 size-5 text-inherit">{COPY_KEY.toUpperCase()}</Kbd> : null}
    </MarketingButton>
  );
}

/** Copy prompt as the site's closing button: the same button the footer call to action uses on every page. */
export function CopyPromptMarketingButton({ text, className }: { text: string; className?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <MarketingButton type="button" variant="accent" size="md" className={className} onClick={copy}>
      <span>Copy prompt</span>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
      {copied ? <SolidCheckIcon className="size-4" /> : null}
    </MarketingButton>
  );
}

/** A plain link in the header, as the site navbar draws Sign in: the landing button's secondary variant. */
export function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <MarketingButton variant="secondary" asChild>
      <Link href={href}>{children}</Link>
    </MarketingButton>
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
