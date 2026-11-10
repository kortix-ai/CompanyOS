'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { YamlLine } from '@/features/marketing/code-panel';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { FACTORY_PROMPT } from '@kortix/shared/setup-guide';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { FACTORY_RUN, TEMPLATES } from './content';

const COPIED_MS = 2000;
/** The page's one accent: the Kortix turquoise (`terminal-accent`, D32). */
const ACCENT = 'text-[var(--terminal-accent)]';
const FACTORY = TEMPLATES.find((template) => template.id === 'software-factory')!;

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
function CopyButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { copied, copy } = useCopy(FACTORY_PROMPT);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'text-background rounded-md bg-[var(--terminal-accent)] font-medium transition-colors hover:bg-[color-mix(in_oklab,var(--terminal-accent)_90%,transparent)]',
        size === 'md' ? 'h-10 px-5 text-sm' : 'h-8 px-3.5 text-sm',
      )}
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy the prompt'}</span>
    </button>
  );
}

/** The brand's dither field in the accent, rising from the bottom edge. */
function Field({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 [mask-image:linear-gradient(to_bottom,transparent,#000_85%)]', className)}>
      <DitherField className="text-[var(--terminal-accent)]" />
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{children}</span>;
}

function PromptCard() {
  const { copied, copy } = useCopy(FACTORY_PROMPT);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy the prompt"
      className="border-border bg-background group w-full rounded-lg border text-left transition-colors hover:border-[color-mix(in_oklab,var(--terminal-accent)_50%,transparent)]"
    >
      <div className="border-border text-muted-foreground flex items-center justify-between border-b px-5 py-3 font-mono text-xs">
        <span>Claude Code · Codex · Cursor</span>
        <span aria-live="polite" className={copied ? ACCENT : 'group-hover:text-foreground'}>
          {copied ? 'copied' : 'click to copy'}
        </span>
      </div>
      <pre className="text-foreground px-5 py-5 font-mono text-sm leading-7 whitespace-pre-wrap">
        <span className={cn('select-none', ACCENT)}>&gt; </span>
        {FACTORY_PROMPT}
      </pre>
    </button>
  );
}

const PIPELINE: Array<{ step: string; title: string; items: string[] }> = [
  { step: 'Signals', title: 'Anything that should become work', items: ['GitHub issues', 'Failing tests', 'Sentry · Better Stack', 'Logs and database anomalies', 'Slack threads', 'Security findings'] },
  { step: 'Tickets', title: 'In the tracker you already use', items: ['GitHub Issues', 'Linear', 'Jira', 'Asana', 'Every comment lands there'] },
  { step: 'Agents', title: 'One per ticket, in its own sandbox', items: ['Your dev environment', 'Your tests', 'Your Claude or Codex plan'] },
  { step: 'Pull requests', title: 'Verified, with a demo', items: ['Tests run and shown', 'A video for visible changes', 'Reviewed by a second agent', 'You merge'] },
];

const CONTROL = [
  { title: 'Your tracker is the truth.', body: 'Tickets, comments and status live where your team already works.' },
  { title: 'You merge.', body: 'Every pull request waits for a person until you allow auto-merge.' },
  { title: 'One folder.', body: 'The whole factory is .kortix/ in your repo. Delete it and it stops.' },
];

/**
 * kortix.com: one product. One prompt adds a software factory to your repo.
 * Black page, one turquoise accent, the brand's dither field as the only art.
 */
export function FactoryHome() {
  return (
    <div className="dark bg-background text-foreground min-h-screen">
      <header className="border-border bg-background sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-6">
          <Link href="/" aria-label="Kortix" className="text-foreground">
            <KortixLogo size={15} variant="logomark" />
          </Link>
          <nav className="text-muted-foreground flex items-center gap-6 text-sm">
            <Link href="#how" className="hover:text-foreground hidden sm:block">How it works</Link>
            <Link href="/factory.md" className="hover:text-foreground hidden sm:block">The guide</Link>
            <a href="https://github.com/kortix-ai/suna" className="hover:text-foreground hidden sm:block">GitHub</a>
            <Link href="/auth" className="hover:text-foreground">Sign in</Link>
            <CopyButton size="sm" />
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <Field className="h-[45%]" />
        <div className="relative mx-auto grid max-w-[1120px] gap-14 px-6 pt-24 pb-28 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-32 lg:pb-36">
          <div className="flex flex-col items-start gap-7">
            <Eyebrow>Software Factory</Eyebrow>
            <h1 className="text-foreground text-[40px] leading-[1.05] font-medium tracking-tight text-balance sm:text-6xl lg:text-[64px]">
              One prompt adds a software factory to your repo.
            </h1>
            <p className="text-muted-foreground max-w-md text-lg text-pretty">
              Issues, failing tests and errors become tickets. Agents turn each one into a verified pull
              request, 24/7, on your Claude or Codex plan.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton />
              <Link href="#run" className="border-border text-foreground hover:bg-card inline-flex h-10 items-center rounded-md border px-5 text-sm font-medium transition-colors">
                See a real run
              </Link>
            </div>
          </div>
          <PromptCard />
        </div>
      </section>

      <section id="how" className="border-border scroll-mt-14 border-t">
        <div className="mx-auto max-w-[1120px] px-6 py-24 lg:py-32">
          <ol className="bg-border border-border grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((column, index) => (
              <li key={column.step} className="bg-background flex flex-col gap-5 p-7">
                <span className={cn('font-mono text-xs', ACCENT)}>
                  {String(index + 1).padStart(2, '0')} · {column.step}
                </span>
                <span className="text-foreground text-xl font-medium tracking-tight text-balance">{column.title}</span>
                <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
                  {column.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="run" className="border-border scroll-mt-14 border-t">
        <div className="mx-auto grid max-w-[1120px] gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-32">
          <div className="flex flex-col gap-5">
            <Eyebrow>A real run</Eyebrow>
            <h2 className="text-foreground text-4xl font-medium tracking-tight text-balance lg:text-5xl">
              Bug found at 15:16. Fix reviewed at 15:21.
            </h2>
            <p className="text-muted-foreground max-w-md text-base">No person in between. The fix waited for a person to merge it.</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="border-border overflow-hidden rounded-lg border">
              <div className="border-border text-muted-foreground border-b px-5 py-3 font-mono text-xs">github.com · {FACTORY_RUN.repo}</div>
              <ol>
                {FACTORY_RUN.events.map((event) => (
                  <li key={event.what} className="border-border flex gap-4 border-b px-5 py-4 last:border-b-0">
                    <span className={cn('w-24 shrink-0 pt-0.5 font-mono text-xs', ACCENT)}>{event.who}</span>
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
            <pre className="border-border overflow-x-auto rounded-lg border px-5 py-4 font-mono text-xs leading-6">
              {FACTORY.excerpt.map((line) => (
                <span key={line} className="block whitespace-pre">
                  <YamlLine line={line} />
                </span>
              ))}
            </pre>
          </div>
        </div>
      </section>

      <section className="border-border border-t">
        <ul className="mx-auto grid max-w-[1120px] gap-12 px-6 py-24 sm:grid-cols-3 lg:py-32">
          {CONTROL.map((point) => (
            <li key={point.title} className="flex flex-col gap-3">
              <span className="text-foreground text-2xl font-medium tracking-tight">{point.title}</span>
              <span className="text-muted-foreground text-base">{point.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-border relative overflow-hidden border-t">
        <Field className="h-full" />
        <div className="relative mx-auto flex max-w-[1120px] flex-col items-start gap-8 px-6 py-32 lg:py-44">
          <h2 className="text-foreground max-w-2xl text-5xl font-medium tracking-tight text-balance lg:text-7xl">
            Your repo. One prompt.
          </h2>
          <CopyButton />
        </div>
      </section>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm">
          <span>Kortix. Open source.</span>
          <nav className="flex flex-wrap gap-6">
            <Link href="/factory.md" className="hover:text-foreground">The guide</Link>
            <Link href="/companyos" className="hover:text-foreground">CompanyOS</Link>
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <a href="https://github.com/kortix-ai/suna" className="hover:text-foreground">GitHub</a>
            <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
