'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { CodePanel } from '@/features/marketing/code-panel';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { FACTORY_RUN, FILE_TREE, PLANS, PROMPT, STEPS, TEMPLATES, promptFor, type HomeTemplate } from './content';

const COPIED_MS = 2000;
const ROTATE_MS = 2600;

/** The one earned accent: the Kortix turquoise (`terminal-accent`), as a low glow. */
const glow = (at: string, strength = 26): CSSProperties => ({
  backgroundImage: `radial-gradient(60% 70% at ${at}, color-mix(in oklch, var(--terminal-accent) ${strength}%, transparent), transparent 70%)`,
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

function CopyButton({ text, label = 'Copy prompt', tone = 'solid' }: { text: string; label?: string; tone?: 'solid' | 'ghost' }) {
  const { copied, copy } = useCopy(text);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-sm px-4 text-sm font-medium transition-colors',
        tone === 'solid'
          ? 'bg-foreground text-background hover:bg-foreground/85'
          : 'border-border text-foreground hover:bg-card border',
      )}
    >
      <span aria-live="polite">{copied ? 'Copied. Paste it into your agent' : label}</span>
    </button>
  );
}

/** "…to run ___": the phrase rotates through the templates; a click scrolls to it. */
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
      className="inline-block text-[var(--terminal-accent)] underline decoration-[var(--terminal-accent)] decoration-2 underline-offset-8 hover:opacity-85"
    >
      <span key={template.id} className="animate-in fade-in slide-in-from-bottom-1 inline-block duration-500">
        {template.phrase}
      </span>
    </a>
  );
}

function Nav() {
  const { copied, copy } = useCopy(PROMPT);
  return (
    <header className="border-border sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-6 px-6">
        <Link href="/" aria-label="Kortix" className="text-foreground">
          <KortixLogo size={15} variant="logomark" />
        </Link>
        <nav className="text-muted-foreground hidden items-center gap-7 text-sm md:flex">
          <Link href="#templates" className="hover:text-foreground">Templates</Link>
          <Link href="/docs/developers#set-up-an-existing-repository" className="hover:text-foreground">Docs</Link>
          <Link href="/companyos" className="hover:text-foreground">CompanyOS</Link>
          <a href="https://github.com/kortix-ai/suna" className="hover:text-foreground">GitHub</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/auth" className="text-muted-foreground hover:text-foreground px-2 text-sm">Sign in</Link>
          <button
            type="button"
            onClick={copy}
            className="bg-foreground text-background hover:bg-foreground/85 h-8 rounded-sm px-3 text-sm font-medium"
          >
            <span aria-live="polite">{copied ? 'Copied' : 'Copy prompt'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** The real run: issue, pull request, review, as they happened. */
function FactoryRun() {
  return (
    <div className="border-border bg-card rounded-sm border">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <span className="text-muted-foreground font-mono text-xs">github.com · {FACTORY_RUN.repo}</span>
        <span className="text-muted-foreground font-mono text-xs">one real run</span>
      </div>
      <ol className="flex flex-col">
        {FACTORY_RUN.events.map((event) => (
          <li key={event.what} className="border-border flex gap-4 border-b px-4 py-4 last:border-b-0">
            <span className="font-mono text-xs text-[var(--terminal-accent)] w-16 shrink-0 pt-0.5">{event.who}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground text-xs">
                {event.what} · {event.at}
              </span>
              <span className="text-foreground text-sm">{event.title}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Showcase({ template, index }: { template: HomeTemplate; index: number }) {
  const prompt = promptFor(template);
  return (
    <section id={template.id} className="border-border relative scroll-mt-14 border-t">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={glow(index % 2 ? '15% 100%' : '85% 100%', 18)} />
      <div className="relative mx-auto grid max-w-[1240px] gap-12 px-6 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-16 lg:py-32">
        <div className="flex flex-col gap-6">
          <span className="text-muted-foreground font-mono text-xs">
            {String(index + 1).padStart(2, '0')} / {String(TEMPLATES.length).padStart(2, '0')} · kortix templates add {template.id}
          </span>
          <h2 className="text-foreground text-3xl font-medium tracking-tight text-balance lg:text-5xl lg:leading-[1.05]">
            {template.name}
          </h2>
          <p className="text-muted-foreground max-w-xl text-lg text-pretty">{template.summary}</p>
          <ul className="flex flex-col gap-2.5 pt-2">
            {template.agents.map((agent) => (
              <li key={agent.name} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                <span className="text-foreground w-40 shrink-0 font-mono text-sm">{agent.name}</span>
                <span className="text-muted-foreground text-sm">{agent.role}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            {template.triggers.map((trigger) => (
              <span key={trigger} className="border-border text-muted-foreground rounded-sm border px-2 py-1 font-mono text-xs">
                {trigger}
              </span>
            ))}
          </div>
          <div className="pt-4">
            <CopyButton text={prompt} label={`Copy the ${template.name} prompt`} />
          </div>
        </div>
        <div className="flex flex-col gap-3 self-center">
          {template.id === 'software-factory' ? <FactoryRun /> : null}
          <CodePanel title={template.file} lines={template.excerpt} lang="yaml" className="h-auto" />
        </div>
      </div>
    </section>
  );
}

/**
 * kortix.com: one prompt to the coding agent you already use adds cloud agents
 * to your repository, on your Codex or Claude plan. Dark, one turquoise glow,
 * a showcase per template as the reader scrolls. CompanyOS lives at /companyos.
 */
export function AgentsHome() {
  return (
    <div className="dark bg-background text-foreground min-h-screen">
      <Nav />

      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={glow('50% 100%', 30)} />
        <div className="relative mx-auto flex max-w-[1240px] flex-col gap-14 px-6 pt-28 pb-24 lg:pt-36 lg:pb-32">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
            <h1 className="text-foreground text-4xl font-medium tracking-tight text-balance sm:text-5xl lg:text-[64px] lg:leading-[1.02]">
              One prompt adds cloud agents to your repo, on your Codex or Claude plan, to run <RotatingPhrase />
            </h1>
            <div className="flex flex-col gap-6">
              <p className="text-muted-foreground text-lg text-pretty">
                Paste it into the coding agent you already use. It adds one kortix.yaml, connects your plan and
                starts agents that work 24/7 in their own cloud sandboxes.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <CopyButton text={PROMPT} />
                <Link href="#templates" className="border-border text-foreground hover:bg-card inline-flex h-10 items-center rounded-sm border px-4 text-sm font-medium">
                  See what it runs
                </Link>
              </div>
            </div>
          </div>
          <div className="border-border bg-card/80 rounded-sm border backdrop-blur">
            <div className="border-border flex items-center gap-3 border-b px-4 py-3">
              <span aria-hidden className="flex gap-1.5">
                <span className="bg-muted-foreground/40 size-2.5" />
                <span className="bg-muted-foreground/30 size-2.5" />
                <span className="bg-muted-foreground/20 size-2.5" />
              </span>
              <span className="text-muted-foreground font-mono text-xs">claude · ~/your-repo</span>
            </div>
            <pre className="text-foreground overflow-x-auto px-5 py-5 font-mono text-sm leading-7 whitespace-pre-wrap">
              <span className="text-[var(--terminal-accent)] select-none">&gt; </span>
              {PROMPT}
            </pre>
          </div>
        </div>
      </section>

      <section id="templates" className="border-border border-t">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-6 pt-20">
          <span className="text-muted-foreground font-mono text-xs">What it runs</span>
          <div className="grid gap-px overflow-hidden rounded-sm border sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATES.map((template, index) => (
              <a key={template.id} href={`#${template.id}`} className="bg-background hover:bg-card ring-border flex flex-col gap-2 p-5 ring-1 transition-colors">
                <span className="text-muted-foreground font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>
                <span className="text-foreground text-base font-medium">{template.name}</span>
                <span className="text-muted-foreground text-sm">{template.triggers[0]}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {TEMPLATES.map((template, index) => (
        <Showcase key={template.id} template={template} index={index} />
      ))}

      <section className="border-border relative overflow-hidden border-t">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={glow('50% 100%', 22)} />
        <div className="relative mx-auto flex max-w-[1240px] flex-col items-center gap-6 px-6 py-28 text-center">
          <h2 className="text-foreground text-3xl font-medium tracking-tight text-balance lg:text-4xl">Runs on the plan you already pay for.</h2>
          <p className="text-muted-foreground max-w-xl text-lg">Your subscription or your key. Kortix shares it with your workspace, so a 3 a.m. run uses it too.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {PLANS.map((plan) => (
              <span key={plan} className="border-border text-foreground rounded-sm border px-3 py-1.5 font-mono text-xs">{plan}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-border border-t">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-24 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-5">
            <h2 className="text-foreground text-3xl font-medium tracking-tight lg:text-4xl">It is one file in your repo.</h2>
            <p className="text-muted-foreground max-w-lg text-lg text-pretty">
              kortix.yaml imports one folder per template. You review it like any other code. Delete the folder
              and the agents stop. Or keep it in its own repository, and your code gets no file at all.
            </p>
            <ol className="flex flex-col gap-3 pt-2">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="text-muted-foreground w-6 shrink-0 font-mono text-xs leading-6">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-sm leading-6">
                    <span className="text-foreground font-medium">{step.title}.</span>{' '}
                    <span className="text-muted-foreground">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="border-border bg-card self-center rounded-sm border px-6 py-5">
            <pre className="text-foreground overflow-x-auto font-mono text-sm leading-7">{FILE_TREE.join('\n')}</pre>
          </div>
        </div>
      </section>

      <section className="border-border relative overflow-hidden border-t">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={glow('50% 120%', 34)} />
        <div className="relative mx-auto flex max-w-[1240px] flex-col items-center gap-6 px-6 py-32 text-center">
          <h2 className="text-foreground max-w-3xl text-4xl font-medium tracking-tight text-balance lg:text-5xl">
            Your repo already has a coding agent. Give it the prompt.
          </h2>
          <CopyButton text={PROMPT} />
        </div>
      </section>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm">
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
