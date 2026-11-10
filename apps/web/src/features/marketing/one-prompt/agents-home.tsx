'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { YamlLine } from '@/features/marketing/code-panel';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { FACTORY_RUN, PROMPT, TEMPLATES, promptFor, type HomeTemplate } from './content';

const COPIED_MS = 2000;
const ROTATE_MS = 2400;
const ACCENT = 'var(--terminal-accent)';

/** The one accent: the Kortix turquoise as soft light behind the content. It fades out before every edge. */
const light = (at: string, strength: number): CSSProperties => ({
  backgroundImage: `radial-gradient(38% 34% at ${at}, color-mix(in oklch, ${ACCENT} ${strength}%, transparent), transparent 100%)`,
});

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

function CopyButton({ text, size = 'md' }: { text: string; size?: 'sm' | 'md' }) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'bg-foreground text-background hover:bg-foreground/85 rounded-full font-medium transition-colors',
        size === 'md' ? 'h-11 px-6 text-sm' : 'h-8 px-4 text-sm',
      )}
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy prompt'}</span>
    </button>
  );
}

/** The headline's last line rotates through the templates; a click scrolls to it. */
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
      className="block min-h-[2.16em] hover:opacity-85 sm:min-h-0"
      style={{ color: ACCENT }}
    >
      <span key={template.id} className="animate-in fade-in slide-in-from-bottom-2 inline-block duration-500">
        {template.phrase}
      </span>
    </a>
  );
}

/** A quiet window: a mono title, then whatever proves the line beside it. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border bg-card/70 overflow-hidden rounded-xl border backdrop-blur">
      <div className="border-border text-muted-foreground border-b px-5 py-3 font-mono text-xs">{title}</div>
      {children}
    </div>
  );
}

function Proof({ template }: { template: HomeTemplate }) {
  if (template.id === 'software-factory') {
    return (
      <Panel title={`github.com · ${FACTORY_RUN.repo} · a real run`}>
        <ol>
          {FACTORY_RUN.events.map((event) => (
            <li key={event.what} className="border-border flex gap-5 border-b px-5 py-4 last:border-b-0">
              <span className="w-16 shrink-0 pt-0.5 font-mono text-xs" style={{ color: ACCENT }}>
                {event.who}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-foreground text-sm">{event.title}</span>
                <span className="text-muted-foreground text-xs">
                  {event.what} · {event.at}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    );
  }
  return (
    <Panel title={template.file}>
      <pre className="overflow-x-auto px-5 py-5 font-mono text-sm leading-7">
        {template.excerpt.map((line) => (
          <span key={line} className="block whitespace-pre">
            <YamlLine line={line} />
          </span>
        ))}
      </pre>
    </Panel>
  );
}

function Showcase({ template, index }: { template: HomeTemplate; index: number }) {
  return (
    <section id={template.id} className="relative scroll-mt-14 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={light(index % 2 === 1 ? '25% 55%' : '75% 55%', 13)} />
      <div className="relative mx-auto grid max-w-[1120px] items-center gap-12 px-6 py-28 lg:grid-cols-2 lg:gap-20 lg:py-40">
        <div className={cn('flex flex-col items-start gap-6', index % 2 === 1 && 'lg:order-2')}>
          <span className="text-muted-foreground font-mono text-xs">
            {String(index + 1).padStart(2, '0')} · {template.name}
          </span>
          <h2 className="text-foreground text-4xl font-medium tracking-tight text-balance lg:text-5xl lg:leading-[1.08]">
            {template.line}
          </h2>
          <p className="text-muted-foreground font-mono text-sm">{template.agents.map((agent) => agent.name).join('  ·  ')}</p>
          <CopyButton text={promptFor(template)} />
        </div>
        <Proof template={template} />
      </div>
    </section>
  );
}

const STEPS = [
  { title: 'Paste', body: 'Into Claude Code, Codex or Cursor.' },
  { title: 'Answer', body: 'It asks. You decide. No secret leaves your hands.' },
  { title: 'Done', body: 'One kortix.yaml in your repo. Agents on, 24/7.' },
];

/**
 * kortix.com, from first principles: say it once, show the prompt, then one
 * picture per template. Dark, one turquoise light, nothing else.
 * The CompanyOS page lives at /companyos.
 */
export function AgentsHome() {
  const hero = useCopy(PROMPT);
  return (
    <div className="dark bg-background text-foreground min-h-screen">
      <header className="sticky top-0 z-30 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-6">
          <Link href="/" aria-label="Kortix" className="text-foreground">
            <KortixLogo size={15} variant="logomark" />
          </Link>
          <nav className="text-muted-foreground flex items-center gap-6 text-sm">
            <Link href="/docs/developers#templates" className="hover:text-foreground hidden sm:block">Docs</Link>
            <Link href="/companyos" className="hover:text-foreground hidden sm:block">CompanyOS</Link>
            <Link href="/auth" className="hover:text-foreground">Sign in</Link>
            <CopyButton text={PROMPT} size="sm" />
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={light('50% 72%', 30)} />
        <div className="relative mx-auto flex max-w-[1120px] flex-col items-center gap-10 px-6 pt-28 pb-32 text-center lg:pt-40 lg:pb-44">
          <h1 className="text-foreground text-[38px] leading-[1.08] font-medium tracking-tight sm:text-6xl lg:text-[84px] lg:leading-[1.02]">
            One prompt to run
            <RotatingPhrase />
          </h1>
          <p className="text-muted-foreground max-w-md text-lg text-balance">
            Cloud agents on your repo, 24/7. On your Claude or Codex plan.
          </p>
          <button
            type="button"
            onClick={hero.copy}
            aria-label="Copy the prompt"
            className="border-border bg-card/70 hover:border-foreground/30 group w-full max-w-2xl rounded-xl border text-left backdrop-blur transition-colors"
          >
            <pre className="text-foreground overflow-x-auto px-6 py-5 font-mono text-sm leading-7 whitespace-pre-wrap">
              <span className="select-none" style={{ color: ACCENT }}>&gt; </span>
              {PROMPT}
            </pre>
            <div className="border-border text-muted-foreground flex items-center justify-between border-t px-6 py-3 text-xs">
              <span>Paste into Claude Code, Codex or Cursor</span>
              <span aria-live="polite" className="text-foreground font-medium">{hero.copied ? 'Copied' : 'Click to copy'}</span>
            </div>
          </button>
        </div>
      </section>

      {TEMPLATES.map((template, index) => (
        <Showcase key={template.id} template={template} index={index} />
      ))}

      <section className="mx-auto max-w-[1120px] px-6 py-28 lg:py-40">
        <ol className="grid gap-12 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span className="font-mono text-xs" style={{ color: ACCENT }}>{String(index + 1).padStart(2, '0')}</span>
              <span className="text-foreground text-3xl font-medium tracking-tight">{step.title}</span>
              <span className="text-muted-foreground text-base">{step.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={light('50% 60%', 26)} />
        <div className="relative mx-auto flex max-w-[1120px] flex-col items-center gap-8 px-6 py-36 text-center lg:py-48">
          <h2 className="text-foreground text-5xl font-medium tracking-tight lg:text-7xl">One prompt.</h2>
          <CopyButton text={PROMPT} />
        </div>
      </section>

      <footer className="text-muted-foreground mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm">
        <span>Kortix. Open source.</span>
        <nav className="flex flex-wrap gap-6">
          <Link href="/companyos" className="hover:text-foreground">CompanyOS</Link>
          <Link href="/docs" className="hover:text-foreground">Docs</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <a href="https://github.com/kortix-ai/suna" className="hover:text-foreground">GitHub</a>
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
