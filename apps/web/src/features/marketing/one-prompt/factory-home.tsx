'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { setupPromptFor } from '@kortix/shared/setup-guide';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { type CSSProperties } from 'react';

import { DEMO, FAQ, RUNS, TOOLS } from './factory-content';
import { FactoryStack } from './factory-stack';
import type { LoopView } from './loops-content';
import { CopyButton, Eyebrow, GhostButton, Mark, useCopy, useSetupTarget } from './parts';

/** The column every section sits in, between the two hairline rails. */
const COLUMN = 'mx-auto w-full max-w-[1192px]';
const H2 = 'text-foreground text-3xl font-medium tracking-tight text-balance lg:text-[40px] lg:leading-tight';

/** A low light in the brand blue, rising from one point. Art only. */
const light = (at: string, strength = 30): CSSProperties => ({
  backgroundImage: `radial-gradient(55% 90% at ${at}, color-mix(in oklch, var(--kortix-base) ${strength}%, transparent), transparent 70%)`,
});

/** The whole product in three moves. */
const STEPS = [
  { title: 'Copy the prompt.', body: 'Paste it into Claude Code or Codex, in your repo.' },
  { title: 'Approve one plan.', body: 'Your agent signs you in, writes kortix.yaml, moves your secrets and builds the dev environment.' },
  { title: 'It runs 24/7.', body: 'Issues, merges, signups and schedules start the agents. You approve what ships.' },
];

/** The prompt itself, as the thing to click: the page's one action. */
function PromptBox({ className }: { className?: string }) {
  const prompt = setupPromptFor(useSetupTarget());
  const { copied, copy } = useCopy(prompt);
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'border-border bg-card/80 hover:border-kortix-base/60 group w-full max-w-xl rounded-xl border p-5 text-left shadow-2xl shadow-black/40 backdrop-blur transition-colors',
        className,
      )}
    >
      <span className="text-foreground/90 block font-mono text-[13px] leading-6 whitespace-pre-wrap">{prompt}</span>
      <span className="border-border mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs">
        <span className="text-muted-foreground flex items-center gap-4">
          <Mark name="Claude Code" />
          <Mark name="Codex" />
        </span>
        <span aria-live="polite" className="bg-kortix-base group-hover:bg-kortix-base/90 shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap font-medium text-white transition-colors">
          {copied ? 'Copied' : 'Copy the prompt'}
        </span>
      </span>
    </button>
  );
}

/**
 * kortix.com. One job: get a developer to copy the prompt. The hero is the
 * prompt; the stack shows what each factory does, one clip per team; three
 * steps, real pull requests and the FAQ answer what is left. The frame (one
 * railed column, hairlines) is after wonder.design; the blue, the dither field
 * and every word are Kortix's own.
 */
export function FactoryHome({ loops, catalog }: { loops: LoopView[]; catalog: string[] }) {
  return (
    <div className="dark bg-background text-foreground relative min-h-screen overflow-x-clip">
      <div className={cn(COLUMN, 'border-border relative border-x')}>
        <header className="border-border bg-background/80 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-8 backdrop-blur md:px-10">
          <Link href="/" aria-label="Kortix" className="text-foreground">
            <KortixLogo size={16} variant="logomark" />
          </Link>
          <nav className="text-muted-foreground hidden items-center gap-8 text-sm md:flex">
            <Link href="#factories" className="hover:text-foreground">Factories</Link>
            <Link href="#how" className="hover:text-foreground">How it works</Link>
            <Link href="#runs" className="hover:text-foreground">Real runs</Link>
            <Link href="/docs/developers" className="hover:text-foreground">Docs</Link>
          </nav>
          <div className="flex items-center gap-2">
            <GhostButton href="/auth">Sign in</GhostButton>
            <CopyButton size="sm" />
          </div>
        </header>

        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[46%] bottom-0 [mask-image:linear-gradient(to_bottom,transparent,#000_55%)]">
            <DitherField className="text-kortix-base" />
          </div>
          <div className="relative flex flex-col items-center gap-8 px-8 pt-20 pb-24 text-center md:px-10 lg:pt-24 lg:pb-28">
            <span className="border-border bg-card text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
              Runs on your <Mark name="Claude" /> or <Mark name="Codex" /> plan
            </span>
            <h1 className="text-foreground text-[44px] leading-[1.04] font-medium tracking-tight text-balance sm:text-6xl lg:text-[72px]">
              One prompt.
              <br />
              Loop everything.
            </h1>
            <p className="text-foreground/70 max-w-lg text-lg text-pretty">
              Paste it into your coding agent. It puts agents on your repo that work 24/7 in the cloud.
            </p>
            <PromptBox className="mt-2" />
          </div>
        </section>

        <section id="factories" className="border-border scroll-mt-16 border-t">
          <div className="flex flex-col gap-3 px-8 pt-20 pb-12 md:px-10">
            <Eyebrow>One workspace · your whole company</Eyebrow>
            <h2 className={H2}>A factory for every team.</h2>
          </div>
          <FactoryStack loops={loops} more={catalog} />
        </section>

        <section id="how" className="border-border scroll-mt-16 border-t">
          <ol className="grid md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-border flex flex-col gap-3 border-b p-8 md:border-r md:border-b-0 md:p-10 md:last:border-r-0">
                <span className="text-kortix-base font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>
                <span className="text-foreground text-2xl font-medium tracking-tight">{step.title}</span>
                <span className="text-muted-foreground text-sm text-pretty">{step.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-border relative overflow-hidden border-t">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={light('15% 120%', 34)} />
          <div aria-hidden className="pointer-events-none absolute inset-0" style={light('90% 130%', 18)} />
          <div className="relative flex flex-col items-center gap-8 px-8 py-24 text-center">
            <h2 className={cn(H2, "max-w-2xl")}>Bring the plan you already pay for.</h2>
            <p className="text-muted-foreground max-w-md text-base">
              Your <Mark name="Claude" /> or <Mark name="Codex" /> subscription, or any API key. A 3 a.m. run uses it too.
            </p>
            <ul className="text-muted-foreground flex max-w-2xl flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
              {TOOLS.filter((tool) => tool !== 'Claude Code' && tool !== 'Codex').map((tool) => (
                <li key={tool}>{tool}</li>
              ))}
            </ul>
          </div>
        </section>

        <section id="runs" className="border-border scroll-mt-16 border-t">
          <div className="flex flex-wrap items-end justify-between gap-6 px-8 pt-20 pb-12 md:px-10">
            <div className="flex flex-col gap-3">
              <Eyebrow>Real runs · Software Factory</Eyebrow>
              <h2 className={H2}>
                Bug found at 15:16.
                <br />
                Fix reviewed at 15:21.
              </h2>
            </div>
            <GhostButton href={`https://github.com/markokraemer/${DEMO.repo}/pulls?q=is%3Apr`}>All pull requests</GhostButton>
          </div>
          <div className="border-border grid border-t md:grid-cols-3">
            {RUNS.map((run) => (
              <a
                key={run.pr}
                href={`https://github.com/markokraemer/${DEMO.repo}/pull/${run.pr}`}
                className="border-border hover:bg-card flex flex-col gap-3 border-b p-8 transition-colors md:border-r md:border-b-0 md:last:border-r-0"
              >
                <span className="text-muted-foreground font-mono text-xs">
                  Issue #{run.issue} → PR #{run.pr}
                </span>
                <span className="text-foreground text-base font-medium">{run.fix}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="border-border grid border-t md:grid-cols-2">
          <div className="border-border flex flex-col gap-4 border-b p-8 md:border-r md:border-b-0 md:p-10">
            <h2 className="text-foreground text-3xl font-medium tracking-tight">Questions.</h2>
            <p className="text-muted-foreground text-sm">
              <Link href="/contact" className="text-foreground underline underline-offset-4">Talk to the team</Link>
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

        <section className="border-border relative overflow-hidden border-t">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-80 [mask-image:linear-gradient(to_bottom,transparent,#000_70%)]">
            <DitherField className="text-kortix-base" />
          </div>
          <div className="relative flex flex-col items-center gap-8 px-8 py-28 text-center">
            <h2 className="text-foreground text-4xl font-medium tracking-tight text-balance lg:text-6xl">
              One prompt.
              <br />
              Loop everything.
            </h2>
            <PromptBox />
          </div>
        </section>

        <footer className="border-border grid gap-10 border-t px-8 py-14 sm:grid-cols-4 md:px-10">
          {[
            { title: 'Product', links: [['Factories', '#factories'], ['How it works', '#how'], ['Real runs', '#runs']] },
            { title: 'Developers', links: [['Docs', '/docs/developers'], ['The setup guide', '/setup.md'], ['GitHub', 'https://github.com/kortix-ai/CompanyOS']] },
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
