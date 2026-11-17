'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { YamlLine } from '@/features/marketing/code-panel';
import { loopPrompt, REFERENCE_REPOS, setupPromptFor } from '@kortix/shared/setup-guide';
import { AgentMarkGlyph, agentMarkTileClass, agentMarkVars } from '@kortix/ui/internal/components/agent-mark';
import { cn } from '@kortix/ui';
import { ArrowRightIcon, PlusIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';

import { ENGINE, FAQ, MANIFEST, TEAMS } from './factory-content';
import { heroRuns } from './hero-runs';
import type { LoopView } from './loops-content';
import { CopyButton, GhostButton, Mark, useSetupTarget } from './parts';
import { ApprovalArt, ComposerArt, ConnectArt, FindArt, ProveArt, SignalArt } from './section-art';
import { SessionReel } from './session-reel';

/** The company site: this page is one product of it. */
const KORTIX = 'https://kortix.com';

/** The column every section sits in. */
const COLUMN = 'mx-auto w-full max-w-[1192px] px-4 sm:px-8 md:px-10';
/** The space between two sections: each one reads as its own chapter. */
const SECTION = 'py-24 lg:py-32';
const H2 = 'text-foreground text-3xl font-medium tracking-tight text-balance sm:text-4xl lg:text-5xl';
const LEAD = 'text-muted-foreground text-lg text-pretty lg:text-xl';

/** What the one prompt does, in order: the onboarding is the product. */
const STEPS = [
  {
    title: 'Finds your software.',
    body: 'It scans the codebase for every tool you use and asks about the ones it cannot see. Names only, never a secret value.',
    art: <FindArt />,
  },
  { title: 'Connects it.', body: 'Secrets, 3,000+ app connectors, Slack and an environment built from your repo.', art: <ConnectArt /> },
  {
    title: 'Sets the signals.',
    body: 'Issues, merges, errors, messages, signups, schedules. You pick what the agents listen to, all of it in one kortix.yaml.',
    art: <SignalArt />,
  },
  {
    title: 'Proves it, then stays.',
    body: 'It loops until one real run finishes. Then it adds the Kortix MCP server to your coding agent, so the next loop is one sentence.',
    art: <ProveArt />,
  },
];

/** The footer: each group's links as [label, href]. */
const FOOTER: Array<{ title: string; links: Array<[string, string]> }> = [
  { title: 'Product', links: [['How it works', '#how'], ['Factories', '#factories'], ['kortix.yaml', '#engine']] },
  { title: 'Developers', links: [['Docs', '/docs/developers'], ['The setup guide', '/setup.md'], ['GitHub', 'https://github.com/kortix-ai/CompanyOS']] },
  { title: 'Company', links: [['Kortix', KORTIX], ['Careers', '/careers'], ['Contact', '/contact']] },
  { title: 'Legal', links: [['Terms', '/legal/terms'], ['Privacy', '/legal?tab=privacy']] },
];

/** The page's one action and where to paste it. */
function PromptCta({ prompt, className }: { prompt?: string; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-3', className)}>
      <CopyButton size="lg" text={prompt} />
      <span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-1.5 text-sm">
        Paste it into <Mark name="Claude Code" /> or <Mark name="Codex" />
      </span>
    </div>
  );
}

/** A section's opening: the title on the left, the lead on the right. */
function SplitHeading({ title, lead, children }: { title: ReactNode; lead: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-16">
      <h2 className={H2}>{title}</h2>
      <div className="flex flex-col items-start gap-6 lg:pt-1.5">
        <p className={LEAD}>{lead}</p>
        {children}
      </div>
    </div>
  );
}

/** A cell of a bordered grid: the art on top, faded where the cell crops it, then the words. */
function ArtCell({ art, title, body, className }: { art: ReactNode; title: string; body: string; className?: string }) {
  return (
    <div className={cn('border-border flex min-w-0 flex-col', className)}>
      <div aria-hidden className="flex h-72 items-center justify-center overflow-hidden px-6 [mask-image:linear-gradient(to_bottom,#000_70%,transparent)] sm:h-80 sm:px-10">
        {art}
      </div>
      <div className="flex flex-col gap-2 px-6 pt-2 pb-8 sm:px-8">
        <h3 className="text-foreground text-base font-medium">{title}</h3>
        <p className="text-muted-foreground max-w-md text-base text-pretty">{body}</p>
      </div>
    </div>
  );
}

/** One tall card: the art in the middle, the name and one line at the bottom. Every card keeps an action row, so the titles line up. */
function TallCard({ art, title, body, action, light }: { art: ReactNode; title: string; body: string; action?: ReactNode; light?: boolean }) {
  return (
    <div className={cn('flex flex-col rounded-xl border p-6 sm:p-8 lg:min-h-[460px]', light ? 'bg-foreground text-background border-transparent' : 'border-border bg-card')}>
      <div aria-hidden className="flex flex-1 items-center justify-center py-6 lg:py-10">
        {art}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className={cn('text-base font-medium', light ? 'text-background' : 'text-foreground')}>{title}</h3>
        <p className={cn('text-base text-pretty lg:min-h-18', light ? 'text-background/70' : 'text-muted-foreground')}>{body}</p>
        <div className={cn('h-12 items-end', action ? 'flex' : 'hidden lg:flex')}>{action}</div>
      </div>
    </div>
  );
}

/** A team's pixel mark without the hover hint: the team's name is printed beside it. */
function TeamMark({ slug }: { slug: string }) {
  return (
    <span aria-hidden style={{ ...agentMarkVars(slug), width: 20, height: 20 }} className={cn('inline-flex items-center justify-center rounded-sm bg-(--mark-tile)', agentMarkTileClass(slug))}>
      <AgentMarkGlyph slug={slug} size={14} />
    </span>
  );
}

/**
 * Loopmaxxing (loopmaxxing.sh), the developer landing. One job: get a developer
 * to copy the prompt. The hero is the headline, the copy button and a reel of
 * agent sessions, the first of them running that prompt. Each section after it
 * opens with a title beside its lead, then shows the product: what the prompt
 * does, the factory and the loops you describe, the plan it runs on,
 * kortix.yaml and the questions.
 */
export function FactoryHome({ loops }: { loops: LoopView[] }) {
  // The factory the page leads with: its name is the headline, its prompt is the one to copy.
  const first = loops[0];
  const target = useSetupTarget();
  const prompt = first ? loopPrompt(first, target) : setupPromptFor(target);
  const runs = useMemo(() => heroRuns(first, prompt), [first, prompt]);
  const name = first?.name ?? 'Software Factory';
  const reference = first ? REFERENCE_REPOS[first.id] : undefined;
  return (
    <div className="dark bg-background text-foreground relative min-h-screen overflow-x-clip">
      <header className="border-border bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className={cn(COLUMN, 'flex h-16 items-center justify-between gap-4')}>
          <div className="flex items-center gap-4">
            <a href={KORTIX} aria-label="Kortix" className="text-foreground">
              <KortixLogo size={16} variant="logomark" />
            </a>
            <span className="text-foreground font-mono text-sm font-medium tracking-wider uppercase">Loopmaxxing</span>
          </div>
          <nav className="text-muted-foreground hidden items-center gap-8 text-sm md:flex">
            <Link href="#how" className="hover:text-foreground transition-colors">How it works</Link>
            <Link href="#factories" className="hover:text-foreground transition-colors">Factories</Link>
            <Link href="#engine" className="hover:text-foreground transition-colors">kortix.yaml</Link>
            <Link href="/docs/developers" className="hover:text-foreground transition-colors">Docs</Link>
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:contents">
              <GhostButton href="/auth">Sign in</GhostButton>
            </span>
            <CopyButton size="sm" text={prompt} />
          </div>
        </div>
      </header>

      <main>
        <section className={COLUMN}>
          <div className="flex flex-col items-start gap-6 pt-20 pb-14 lg:pt-32 lg:pb-20">
            <span className="text-muted-foreground text-sm">Loopmaxxing for dev teams</span>
            <h1 className="text-foreground max-w-5xl text-4xl font-medium tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Add a {name}
              <br />
              with 1 prompt.
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg text-pretty">
              Agents that work on your repo and your tools, in the cloud, 24/7. One prompt sets them up, on the plan you already pay for. You approve what ships.
            </p>
            <PromptCta prompt={prompt} className="mt-2" />
          </div>
          <div className="pb-8">
            <SessionReel runs={runs} />
          </div>
        </section>

        <section id="how" className={cn(COLUMN, SECTION, 'scroll-mt-16')}>
          <SplitHeading
            title="One conversation sets up the whole loop"
            lead="The prompt walks your coding agent through the setup with you. It asks before every decision and stops when one real run has finished."
          />
          <div className="border-border mt-16 grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border md:grid-cols-2 [&>*]:border-b [&>*:last-child]:border-b-0 md:[&>*:nth-child(odd)]:border-r md:[&>*:nth-last-child(-n+2)]:border-b-0">
            {STEPS.map((step) => (
              <ArtCell
                key={step.title}
                {...step}
              />
            ))}
          </div>
        </section>

        <section id="factories" className={cn(COLUMN, SECTION, 'scroll-mt-16')}>
          <SplitHeading title={`Start with a factory, then loop anything`} lead={first?.line ?? 'Issues, failing tests and errors in. Verified pull requests out.'}>
            {reference ? (
              <a href={reference} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors">
                See the template
                <ArrowRightIcon className="size-3.5" />
              </a>
            ) : null}
          </SplitHeading>
          <div className="mt-16 grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-3">
            <TallCard
              light
              art={<ComposerArt tone="light" text="Run the tests. File what fails." />}
              title={name}
              body={`1 agent, ${first?.triggers ?? 3} triggers and ${first?.skills ?? 1} ${first?.skills === 1 ? 'skill' : 'skills'}, from a public template your agent adapts to your repo.`}
              action={<CopyButton tone="dark" text={prompt} />}
            />
            <TallCard
              art={<ComposerArt text="Every new signup: research the company, score it and draft the outreach." />}
              title="Any loop you describe"
              body="Say what should happen and when. Your coding agent writes it as code in your repo."
              action={<CopyButton text={setupPromptFor(target)} />}
            />
            <TallCard art={<ApprovalArt />} title="You approve what ships" body="Every pull request, post and outbound draft waits for a person until you allow more." />
          </div>
          <ul className="mt-16 grid grid-cols-2 gap-y-10 lg:grid-cols-3 lg:gap-y-12">
            {TEAMS.map((team) => (
              <li key={team.slug} className="border-border flex flex-col gap-3 border-l pr-3 pl-4 sm:pl-8">
                <TeamMark slug={team.slug} />
                <span className="text-foreground text-sm font-medium">{team.name}</span>
                <span className="text-muted-foreground max-w-60 text-sm text-pretty">{team.line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={cn(COLUMN, 'py-16 lg:py-20')}>
          <SplitHeading
            title="Bring the plan you already pay for"
            lead="Your Claude or ChatGPT subscription, or any API key. A 3 a.m. run uses it too."
          />
        </section>

        <section id="engine" className={cn(COLUMN, SECTION, 'scroll-mt-16')}>
          <SplitHeading
            title="One file in your repo runs all of it"
            lead="The setup adds kortix.yaml. It defines every agent, what starts it and what it may touch. You review it like code."
          />
          <div className="border-border mt-16 grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="border-border bg-card/40 border-b lg:border-r lg:border-b-0">
              <div className="border-border text-muted-foreground border-b px-6 py-3 font-mono text-xs">kortix.yaml</div>
              <pre className="overflow-x-auto px-6 py-5 font-mono text-xs leading-6">
                {MANIFEST.map((line, i) => (
                  <span key={i} className="block whitespace-pre">
                    {line === '' ? ' ' : <YamlLine line={line} />}
                  </span>
                ))}
              </pre>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)] content-start sm:grid-cols-2 sm:[&>div:nth-last-child(-n+2)]:border-b-0 [&>div:last-child]:border-b-0">
              {ENGINE.map((part) => (
                <div key={part.term} className="border-border flex flex-col gap-2 border-b p-6 sm:odd:border-r">
                  <dt className="text-foreground flex items-baseline gap-2 text-sm font-medium">
                    {part.term}
                    <span className="text-muted-foreground font-mono text-xs font-normal">{part.key}</span>
                  </dt>
                  <dd className="text-muted-foreground text-sm text-pretty">{part.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className={cn(COLUMN, SECTION, 'grid gap-10 lg:grid-cols-2 lg:gap-16')}>
          <div className="flex flex-col items-start gap-4">
            <h2 className={H2}>Questions</h2>
            <Link href="/contact" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors">
              Talk to the team
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </div>
          <div className="border-border border-t">
            {FAQ.map((item) => (
              <details key={item.q} className="border-border group border-b">
                <summary className="text-foreground flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <PlusIcon aria-hidden className="text-muted-foreground size-4 shrink-0 transition-transform duration-moderate ease-out group-open:rotate-45 motion-reduce:transition-none" />
                </summary>
                <p className="text-muted-foreground max-w-xl pb-6 text-base text-pretty">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[70%] bottom-0 opacity-80 [mask-image:linear-gradient(to_bottom,transparent,#000_70%)]">
            <DitherField className="text-kortix-base" />
          </div>
          <div className={cn(COLUMN, 'relative flex flex-col items-center gap-6 py-32 text-center lg:py-44')}>
            <h2 className="text-foreground text-4xl font-medium tracking-tight text-balance sm:text-5xl lg:text-6xl">
              One prompt.
              <br />
              Your whole company, looped.
            </h2>
            <p className="text-muted-foreground max-w-md text-lg text-pretty">Paste it into Claude Code or Codex. Your agent asks before every decision.</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <CopyButton size="lg" text={prompt} />
              <Link
                href="/docs/developers"
                className="border-border bg-card text-foreground hover:bg-accent inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium transition-colors"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className={cn(COLUMN, 'grid grid-cols-2 gap-10 py-14 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,1fr))]')}>
          <a href={KORTIX} aria-label="Kortix" className="text-foreground col-span-2 md:col-span-1">
            <KortixLogo size={16} variant="logomark" />
          </a>
          {FOOTER.map((group) => (
            <div key={group.title} className="flex flex-col gap-3 text-sm">
              <span className="text-foreground font-medium">{group.title}</span>
              {group.links.map(([label, href]) => (
                <Link key={label} href={href} className="text-muted-foreground hover:text-foreground transition-colors">
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className={cn(COLUMN, 'text-muted-foreground pb-10 text-xs')}>Loopmaxxing, by Kortix. Open source.</div>
      </footer>
    </div>
  );
}
