'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { FACTORY_PROMPT } from '@kortix/shared/setup-guide';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { Codex } from '@kortix/ui/internal/icons/codex';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { DEMO, FAQ, RUNS, SOURCES, TOOLS } from './factory-content';

const COPIED_MS = 2000;
/** The page's one accent: the brand blue (`kortix-base`). */
const ACCENT = 'text-kortix-base';
/** The column every section sits in, between the two hairline rails. */
const COLUMN = 'mx-auto w-full max-w-[1192px]';

/** A low light in the brand blue, rising from one point. Art only. */
const light = (at: string, strength = 30): CSSProperties => ({
  backgroundImage: `radial-gradient(55% 90% at ${at}, color-mix(in oklch, var(--kortix-base) ${strength}%, transparent), transparent 70%)`,
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

function CopyButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { copied, copy } = useCopy(FACTORY_PROMPT);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'bg-kortix-base hover:bg-kortix-base/90 rounded-md font-medium text-white transition-colors',
        size === 'md' ? 'h-9 px-4 text-sm' : 'h-8 px-3 text-sm',
      )}
    >
      <span aria-live="polite">{copied ? 'Copied' : 'Copy the prompt'}</span>
    </button>
  );
}

function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="border-border bg-card text-foreground hover:bg-accent inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors">
      {children}
    </Link>
  );
}

/** A product name with its mark, inline in running text (founder call 2026-11-10: Claude and Codex show their logos). */
function Mark({ name }: { name: 'Claude' | 'Codex' | 'Claude Code' }) {
  const Icon = name === 'Codex' ? Codex : Claude;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-[1em] shrink-0" />
      {name}
    </span>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{children}</span>;
}

/** A caption that opens in the foreground and continues muted. */
function Caption({ lead, rest }: { lead: string; rest: string }) {
  return (
    <p className="max-w-sm text-base leading-6">
      <span className="text-foreground font-medium">{lead}</span> <span className="text-muted-foreground">{rest}</span>
    </p>
  );
}

function Window({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
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

const STATE_DOT: Record<string, string> = {
  'in review': 'bg-kortix-base',
  'in progress': 'bg-kortix-yellow',
  ready: 'bg-muted-foreground',
};

/** The factory as it ran on the demo repository: tickets, a worker, the pull request. */
function ProductWindow() {
  return (
    <Window title={<span className="font-mono">kortix · {DEMO.repo} · Software Factory</span>}>
      <div className="grid min-h-[420px] lg:grid-cols-[260px_1fr_340px]">
        <aside className="border-border hidden flex-col gap-1 border-r p-3 lg:flex">
          <span className="text-muted-foreground px-2 pt-1 pb-2 text-xs">Tickets · GitHub Issues</span>
          {DEMO.tickets.map((ticket, index) => (
            <div key={ticket.number} className={cn('flex gap-2.5 rounded-md px-2 py-2', index === 0 && 'bg-accent')}>
              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', STATE_DOT[ticket.state])} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground truncate text-sm">{ticket.title}</span>
                <span className="text-muted-foreground text-xs">
                  #{ticket.number} · {ticket.state}
                </span>
              </span>
            </div>
          ))}
        </aside>
        <div className="border-border flex flex-col border-r">
          <div className="border-border text-muted-foreground border-b px-5 py-3 text-xs">worker · #{DEMO.tickets[0]!.number}</div>
          <div className="flex flex-1 flex-col gap-4 p-5 font-mono text-xs leading-6">
            {DEMO.worker.map((line) => (
              <div key={line.text} className={line.kind === 'cmd' ? 'text-foreground' : line.kind === 'ok' ? ACCENT : 'text-muted-foreground'}>
                {line.kind === 'cmd' ? <span className="text-muted-foreground select-none">$ </span> : null}
                {line.text}
              </div>
            ))}
          </div>
          <div className="border-border m-3 rounded-md border px-4 py-3 text-sm">
            <span className="text-muted-foreground">Add a Kortix software factory to this repository with me.</span>
          </div>
        </div>
        <div className="hidden flex-col lg:flex">
          <div className="border-border text-muted-foreground border-b px-5 py-3 text-xs">pull request #{DEMO.pr.number}</div>
          <div className="flex flex-col gap-4 p-5">
            <span className="text-foreground text-sm font-medium">{DEMO.pr.title}</span>
            <span className="text-muted-foreground text-xs">
              +{DEMO.pr.additions} −{DEMO.pr.deletions} · {DEMO.pr.branch}
            </span>
            <div className="border-border flex flex-col gap-2 rounded-md border p-4">
              <span className="text-foreground text-xs font-medium">What I ran</span>
              {DEMO.pr.checks.map((check) => (
                <span key={check} className="text-muted-foreground font-mono text-xs">
                  {check}
                </span>
              ))}
            </div>
            <span className="text-muted-foreground text-xs">Waiting for a person to merge.</span>
          </div>
        </div>
      </div>
    </Window>
  );
}

function Bento({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-border grid border-t md:grid-cols-2', className)}>{children}</div>;
}

function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-border flex flex-col justify-between gap-10 border-b p-8 md:border-r md:p-10 md:even:border-r-0', className)}>{children}</div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-foreground px-8 pt-24 pb-16 text-3xl font-medium tracking-tight text-balance md:px-10 lg:text-[40px] lg:leading-tight">
      {children}
    </h2>
  );
}

/**
 * kortix.com: one product. One prompt adds a software factory to your repo.
 * The page frame (one railed column, hairline bento grids, glow bands)
 * after wonder.design; the look, words and every panel are Kortix's own: the
 * brand blue, the dither field, and data from a real factory run.
 */
export function FactoryHome() {
  const { copied, copy } = useCopy(FACTORY_PROMPT);
  return (
    <div className="dark bg-background text-foreground relative min-h-screen overflow-x-clip">
      <div className={cn(COLUMN, 'border-border relative border-x')}>
        <header className="border-border bg-background/80 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-8 backdrop-blur md:px-10">
          <Link href="/" aria-label="Kortix" className="text-foreground">
            <KortixLogo size={16} variant="logomark" />
          </Link>
          <nav className="text-muted-foreground hidden items-center gap-8 text-sm md:flex">
            <Link href="#how" className="hover:text-foreground">How it works</Link>
            <Link href="#runs" className="hover:text-foreground">Real runs</Link>
            <Link href="/factory.md" className="hover:text-foreground">The guide</Link>
            <Link href="/docs/developers#templates" className="hover:text-foreground">Docs</Link>
          </nav>
          <div className="flex items-center gap-2">
            <GhostButton href="/auth">Sign in</GhostButton>
            <CopyButton size="sm" />
          </div>
        </header>

        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[38%] bottom-0 [mask-image:linear-gradient(to_bottom,transparent,#000_30%)]">
            <DitherField className="text-kortix-base" />
          </div>
          <div className="relative grid gap-10 px-8 pt-24 pb-16 md:px-10 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:gap-20 lg:pt-28">
            <div className="flex flex-col items-start gap-7">
              <span className="border-border bg-card text-foreground inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-sm">
                <span className="bg-kortix-base/15 text-kortix-base rounded-full px-2 py-0.5 font-mono text-xs">new</span>
                Runs on your <Mark name="Claude" /> or <Mark name="Codex" /> plan
              </span>
              <h1 className="text-foreground text-[40px] leading-[1.06] font-medium tracking-tight text-balance sm:text-5xl lg:text-[56px]">
                One prompt adds a software factory to your repo.
              </h1>
            </div>
            <div className="flex flex-col gap-6 lg:pb-2">
              <p className="text-muted-foreground text-lg text-pretty">
                Issues, failing tests and errors become tickets in your tracker. Agents turn each one into a
                verified pull request, 24/7, while you sleep.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <CopyButton />
                <GhostButton href="#runs">See a real run</GhostButton>
              </div>
            </div>
          </div>
          <div className="relative px-4 pb-24 md:px-8 lg:pb-32">
            <ProductWindow />
          </div>
        </section>

        <section className="border-border border-t">
          <div className="flex flex-col items-center gap-8 px-8 py-14">
            <Eyebrow>Works with the tools you already use</Eyebrow>
            <ul className="text-muted-foreground flex flex-wrap justify-center gap-x-12 gap-y-4 text-xl font-medium tracking-tight">
              {TOOLS.map((tool) => (
                <li key={tool}>{tool === 'Claude Code' || tool === 'Codex' ? <Mark name={tool} /> : tool}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-border relative overflow-hidden border-t">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={light('15% 120%', 34)} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={light('90% 130%', 18)} />
          <div className="relative flex flex-col items-center gap-10 px-8 py-28 text-center">
            <button
              type="button"
              onClick={copy}
              className="border-border bg-card/80 hover:border-kortix-base/50 w-full max-w-lg rounded-xl border p-4 text-left backdrop-blur transition-colors"
            >
              <span className="text-foreground block text-sm">{FACTORY_PROMPT.split('\n')[0]}</span>
              <span className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
                <span className="text-foreground flex items-center gap-3"><Mark name="Claude Code" /><Mark name="Codex" /></span>
                <span aria-live="polite" className={copied ? ACCENT : undefined}>{copied ? 'copied' : 'click to copy'}</span>
              </span>
            </button>
            <div className="flex flex-col items-center gap-3">
              <h2 className="text-foreground max-w-md text-3xl font-medium tracking-tight text-balance">Bring the plan you already pay for.</h2>
              <p className="text-muted-foreground max-w-md text-base">
                Your <Mark name="Claude" /> or <Mark name="Codex" /> plan, or any API key. Shared with your workspace, so a 3 a.m. run uses it too.
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="border-border scroll-mt-16 border-t">
          <SectionTitle>
            From a signal to a pull request.
            <br />
            And back to your tracker.
          </SectionTitle>
          <Bento>
            <Cell>
              <div className="border-border bg-card flex size-20 items-center justify-center self-center rounded-full border">
                <KortixLogo size={22} variant="symbol" className="text-foreground" />
              </div>
              <Caption lead="Connect your repository." rest="Your agent adds one folder, .kortix/, or keeps it in a repository of its own." />
            </Cell>
            <Cell>
              <div className="border-border flex flex-col rounded-md border">
                {DEMO.tickets.map((ticket) => (
                  <div key={ticket.number} className="border-border flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                    <span className={cn('size-1.5 rounded-full', STATE_DOT[ticket.state])} />
                    <span className="text-foreground min-w-0 flex-1 truncate text-sm">{ticket.title}</span>
                    <span className="text-muted-foreground font-mono text-xs">#{ticket.number}</span>
                  </div>
                ))}
              </div>
              <Caption lead="Every signal becomes a ticket." rest="In GitHub Issues, Linear, Jira or Asana. Every comment and status lands there." />
            </Cell>
            <Cell>
              <div className="border-border bg-card rounded-md border p-5 font-mono text-xs leading-6">
                {DEMO.worker.map((line) => (
                  <div key={line.text} className={line.kind === 'ok' ? ACCENT : line.kind === 'cmd' ? 'text-foreground' : 'text-muted-foreground'}>
                    {line.kind === 'cmd' ? '$ ' : ''}
                    {line.text}
                  </div>
                ))}
              </div>
              <Caption lead="An agent proves the fix." rest="In its own sandbox, on your dev environment and your tests. A video when the change is visible." />
            </Cell>
            <Cell>
              <div className="border-border flex flex-col gap-4 rounded-md border p-5">
                <span className="text-foreground text-sm font-medium">{DEMO.pr.title}</span>
                <span className="text-muted-foreground text-xs">Reviewed by a second agent · {DEMO.pr.checks[1]}</span>
                <span className="bg-kortix-base self-start rounded-md px-3 py-1.5 text-xs font-medium text-white">Merge</span>
              </div>
              <Caption lead="You merge." rest="Every pull request waits for a person until you allow auto-merge." />
            </Cell>
          </Bento>
        </section>

        <section className="border-border border-t">
          <SectionTitle>
            Start with one source.
            <br />
            Add the rest when you trust it.
          </SectionTitle>
          <Bento>
            <Cell>
              <div className="border-border flex flex-col rounded-md border">
                {SOURCES.map((source) => (
                  <div key={source.name} className="border-border flex items-center justify-between border-b px-4 py-3 last:border-b-0">
                    <span className="text-foreground text-sm">{source.name}</span>
                    <span className={cn('rounded-full px-2 py-0.5 font-mono text-xs', source.on ? 'bg-kortix-base/15 text-kortix-base' : 'bg-accent text-muted-foreground')}>
                      {source.on ? 'on' : 'off'}
                    </span>
                  </div>
                ))}
              </div>
              <Caption lead="Sources are switches." rest="GitHub issues and nightly tests are on. Errors, logs, Slack and security wait for you." />
            </Cell>
            <Cell>
              <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-5">
                <span className="text-muted-foreground font-mono text-xs">factory.json</span>
                <pre className="text-foreground font-mono text-xs leading-6">{`"merge": { "policy": "hold" },
"caps": { "workers": 3,
  "new_tickets_per_source_per_day": 5 }`}</pre>
              </div>
              <Caption lead="It never outruns you." rest="Three workers, five new tickets per source a day, and a person merges. One file sets it." />
            </Cell>
          </Bento>
        </section>

        <section className="border-border relative overflow-hidden border-t">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-90 [mask-image:linear-gradient(to_bottom,transparent,#000_60%)]">
            <DitherField className="text-kortix-base" />
          </div>
          <div className="relative flex flex-col items-center gap-6 px-8 py-32 text-center">
            <ul aria-hidden className="text-muted-foreground flex gap-10 font-mono text-sm">
              <li className="-rotate-6">issues</li>
              <li className="translate-y-2 rotate-3">tests</li>
              <li className="-rotate-3">errors</li>
            </ul>
            <h2 className="text-foreground max-w-lg text-3xl font-medium tracking-tight text-balance lg:text-4xl">
              Bug found at 15:16.
              <br />
              Fix reviewed at 15:21.
            </h2>
            <GhostButton href="#runs">See the runs</GhostButton>
          </div>
        </section>

        <section id="runs" className="border-border scroll-mt-16 border-t">
          <div className="flex items-end justify-between px-8 pt-24 pb-16 md:px-10">
            <h2 className="text-foreground text-3xl font-medium tracking-tight lg:text-[40px] lg:leading-tight">
              Real runs
            </h2>
            <a href={`https://github.com/markokraemer/${DEMO.repo}/pulls?q=is%3Apr`} className="border-border bg-card text-foreground hover:bg-accent rounded-md border px-3 py-1.5 text-sm">
              All pull requests
            </a>
          </div>
          <div className="border-border grid border-t md:grid-cols-3">
            {RUNS.map((run) => (
              <a key={run.pr} href={`https://github.com/markokraemer/${DEMO.repo}/pull/${run.pr}`} className="border-border hover:bg-card flex flex-col gap-4 border-b p-8 transition-colors md:border-r md:last:border-r-0 md:p-10">
                <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                  Issue #{run.issue} → PR #{run.pr} · Nov 10, 2026
                </span>
                <span className="text-foreground text-base font-medium">{run.fix}</span>
                <span className="text-muted-foreground text-sm">{run.bug}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="border-border grid border-t md:grid-cols-2">
          <div className="border-border flex flex-col gap-4 border-b p-8 md:border-r md:border-b-0 md:p-10">
            <h2 className="text-foreground text-3xl font-medium tracking-tight">Frequently asked questions.</h2>
            <p className="text-muted-foreground text-sm">
              Something else on your mind? <Link href="/contact" className="text-foreground underline underline-offset-4">Talk to the team</Link>.
            </p>
          </div>
          <div>
            {FAQ.map((item) => (
              <details key={item.q} className="border-border group border-b last:border-b-0">
                <summary className="text-foreground flex cursor-pointer list-none items-center justify-between px-6 py-4 text-sm font-medium">
                  {item.q}
                  <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
                </summary>
                <p className="text-muted-foreground px-6 pb-5 text-sm">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-border flex flex-col gap-8 border-t px-8 py-24 md:flex-row md:items-end md:justify-between md:px-10 lg:py-32">
          <h2 className="text-foreground max-w-md text-4xl font-medium tracking-tight text-balance lg:text-5xl">
            One prompt.
            <br />
            A software factory.
          </h2>
          <div className="flex gap-2.5">
            <CopyButton />
            <GhostButton href="/factory.md">Read the guide</GhostButton>
          </div>
        </section>

        <footer className="border-border grid gap-10 border-t px-8 py-14 sm:grid-cols-4 md:px-10">
          {[
            { title: 'Product', links: [['How it works', '#how'], ['Real runs', '#runs'], ['The guide', '/factory.md']] },
            { title: 'Developers', links: [['Docs', '/docs/developers#templates'], ['GitHub', 'https://github.com/kortix-ai/suna']] },
            { title: 'Company', links: [['CompanyOS', '/companyos'], ['Careers', '/careers']] },
            { title: 'Legal', links: [['Terms', '/legal/terms'], ['Privacy', '/legal?tab=privacy']] },
          ].map((group) => (
            <div key={group.title} className="flex flex-col gap-3 text-sm">
              <span className="text-muted-foreground">{group.title}</span>
              {group.links.map(([label, href]) => (
                <Link key={label} href={href!} className="text-foreground hover:text-muted-foreground">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </footer>
        <div className="border-border text-muted-foreground border-t px-8 py-6 text-center text-xs md:px-10">Kortix. Open source.</div>
      </div>
    </div>
  );
}
