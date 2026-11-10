'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { YamlLine } from '@/features/marketing/code-panel';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { FACTORY_RUN, PROMPT, TEMPLATES, promptFor, type HomeTemplate } from './content';

const COPIED_MS = 2000;
const ROTATE_MS = 2400;
/** The page's one accent: the Kortix turquoise (`terminal-accent`, D32). */
const ACCENT = 'text-[var(--terminal-accent)]';

function useCopy(text: string) {
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

/** The primary action, in the accent. Hover is its own fill at 90% (motion.md). */
function CopyButton({ text, size = 'md', label = 'Copy prompt' }: { text: string; size?: 'sm' | 'md'; label?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'text-background rounded-md bg-[var(--terminal-accent)] font-medium transition-colors hover:bg-[color-mix(in_oklab,var(--terminal-accent)_90%,transparent)]',
        size === 'md' ? 'h-10 px-5 text-sm' : 'h-8 px-3.5 text-sm',
      )}
    >
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}

/** The headline's second line rotates through the templates; a click scrolls to it. */
function RotatingPhrase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % TEMPLATES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);
  const template = TEMPLATES[index]!;
  return (
    <a
      href={`#${template.id}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      // Two lines of room on a phone, so a longer phrase never moves the page.
      className={cn('block min-h-[2.1em] sm:min-h-0', ACCENT)}
    >
      <span key={template.id} className="animate-in fade-in inline-block duration-500">
        {template.phrase}.
      </span>
    </a>
  );
}

/** The brand's dither field in the accent, rising from the bottom edge. Dark art, both themes. */
function Field({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 [mask-image:linear-gradient(to_bottom,transparent,#000_85%)]',
        className,
      )}
    >
      <DitherField className="text-[var(--terminal-accent)]" />
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{children}</span>;
}

/** What you paste, and what happened on a real repository after it. */
function HeroWindow() {
  const { copied, copy } = useCopy(PROMPT);
  return (
    <div className="border-border bg-background relative grid overflow-hidden rounded-lg border text-left lg:grid-cols-2">
      <button type="button" onClick={copy} aria-label="Copy the prompt" className="border-border group flex flex-col border-b lg:border-r lg:border-b-0">
        <div className="border-border text-muted-foreground flex w-full items-center justify-between border-b px-5 py-3 font-mono text-xs">
          <span>you paste</span>
          <span aria-live="polite" className={cn('transition-colors', copied ? ACCENT : 'group-hover:text-foreground')}>
            {copied ? 'copied' : 'click to copy'}
          </span>
        </div>
        <pre className="text-foreground flex-1 px-5 py-5 text-left font-mono text-sm leading-7 whitespace-pre-wrap">
          <span className={cn('select-none', ACCENT)}>&gt; </span>
          {PROMPT}
        </pre>
      </button>
      <div className="flex flex-col">
        <div className="border-border text-muted-foreground flex items-center justify-between border-b px-5 py-3 font-mono text-xs">
          <span>your agents run</span>
          <span>{FACTORY_RUN.repo} · a real run</span>
        </div>
        <ol className="flex-1">
          {FACTORY_RUN.events.map((event) => (
            <li key={event.what} className="border-border flex gap-4 border-b px-5 py-4 last:border-b-0">
              <span className={cn('w-16 shrink-0 pt-0.5 font-mono text-xs', ACCENT)}>{event.who}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-foreground text-sm">{event.title}</span>
                <span className="text-muted-foreground text-xs">
                  {event.what} · {event.at}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function TemplateCard({ template, index, wide }: { template: HomeTemplate; index: number; wide?: boolean }) {
  const { copied, copy } = useCopy(promptFor(template));
  return (
    <article
      id={template.id}
      className={cn('bg-background flex scroll-mt-20 flex-col gap-8 p-8 lg:p-10', wide && 'lg:col-span-2 lg:flex-row lg:items-end lg:justify-between lg:gap-16')}
    >
      <div className="flex flex-col items-start gap-5">
        <Eyebrow>
          {String(index + 1).padStart(2, '0')} · {template.name}
        </Eyebrow>
        <h3 className={cn('text-foreground font-medium tracking-tight text-balance', wide ? 'text-4xl lg:text-5xl' : 'text-2xl lg:text-3xl')}>
          {template.line}
        </h3>
        <button type="button" onClick={copy} className={cn('text-sm font-medium underline-offset-4 hover:underline', ACCENT)}>
          <span aria-live="polite">{copied ? 'Copied' : 'Copy prompt'}</span>
        </button>
      </div>
      <pre className={cn('border-border overflow-x-auto rounded-md border px-4 py-3 font-mono text-xs leading-6', wide ? 'lg:w-[440px] lg:shrink-0' : 'mt-auto')}>
        {template.excerpt.slice(0, wide ? 6 : 3).map((line) => (
          <span key={line} className="block whitespace-pre">
            <YamlLine line={line} />
          </span>
        ))}
      </pre>
    </article>
  );
}

const STEPS = [
  { title: 'Paste', body: 'Into Claude Code, Codex or Cursor.' },
  { title: 'Answer', body: 'It asks. You decide.' },
  { title: 'Done', body: 'One kortix.yaml. Agents on, 24/7.' },
];

/**
 * kortix.com: a black page, one turquoise accent, the brand's dither field as
 * the only art. Say it once, show the prompt and a real result, then the
 * templates. The CompanyOS page lives at /companyos.
 */
export function AgentsHome() {
  return (
    <div className="dark bg-background text-foreground min-h-screen">
      <header className="border-border bg-background sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-6">
          <Link href="/" aria-label="Kortix" className="text-foreground">
            <KortixLogo size={15} variant="logomark" />
          </Link>
          <nav className="text-muted-foreground flex items-center gap-6 text-sm">
            <Link href="#templates" className="hover:text-foreground hidden sm:block">Templates</Link>
            <Link href="/docs/developers#templates" className="hover:text-foreground hidden sm:block">Docs</Link>
            <Link href="/companyos" className="hover:text-foreground hidden sm:block">CompanyOS</Link>
            <Link href="/auth" className="hover:text-foreground">Sign in</Link>
            <CopyButton text={PROMPT} size="sm" />
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <Field className="h-[55%]" />
        <div className="relative mx-auto flex max-w-[1120px] flex-col gap-16 px-6 pt-24 pb-24 lg:pt-32 lg:pb-32">
          <div className="flex flex-col items-start gap-8">
            <Eyebrow>On your Claude or Codex plan</Eyebrow>
            <h1 className="text-foreground text-[40px] leading-[1.05] font-medium tracking-tight sm:text-6xl lg:text-7xl">
              One prompt to run
              <RotatingPhrase />
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton text={PROMPT} />
              <Link href="#templates" className="border-border text-foreground hover:bg-card inline-flex h-10 items-center rounded-md border px-5 text-sm font-medium transition-colors">
                See what it runs
              </Link>
            </div>
          </div>
          <HeroWindow />
        </div>
      </section>

      <section id="templates" className="border-border scroll-mt-14 border-t">
        <div className="mx-auto max-w-[1120px] px-6 py-24 lg:py-32">
          <div className="bg-border border-border grid gap-px overflow-hidden rounded-lg border lg:grid-cols-2">
            {TEMPLATES.map((template, index) => (
              <TemplateCard key={template.id} template={template} index={index} wide={index === 0} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-border border-t">
        <ol className="mx-auto grid max-w-[1120px] gap-12 px-6 py-24 sm:grid-cols-3 lg:py-32">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span className={cn('font-mono text-xs', ACCENT)}>{String(index + 1).padStart(2, '0')}</span>
              <span className="text-foreground text-3xl font-medium tracking-tight">{step.title}</span>
              <span className="text-muted-foreground text-base">{step.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-border relative overflow-hidden border-t">
        <Field className="h-full" />
        <div className="relative mx-auto flex max-w-[1120px] flex-col items-start gap-8 px-6 py-32 lg:py-44">
          <h2 className="text-foreground text-5xl font-medium tracking-tight lg:text-7xl">One prompt.</h2>
          <CopyButton text={PROMPT} />
        </div>
      </section>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm">
          <span>Kortix. Open source.</span>
          <nav className="flex flex-wrap gap-6">
            <Link href="/companyos" className="hover:text-foreground">CompanyOS</Link>
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <a href="https://github.com/kortix-ai/suna" className="hover:text-foreground">GitHub</a>
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
