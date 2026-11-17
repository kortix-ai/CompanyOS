'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import Footer from '@/components/home/footer';
import { FaqSection } from '@/features/marketing/faq';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { MarketingButton } from '@/features/marketing/kit/marketing-button';
import { loopPrompt, REFERENCE_REPOS, setupPromptFor } from '@kortix/shared/setup-guide';
import { cn } from '@kortix/ui';
import { ArrowRightIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

import { FAQ, TEAMS } from './factory-content';
import { heroRuns } from './hero-runs';
import type { LoopView } from './loops-content';
import { CopyButton, CopyPromptMarketingButton, GhostButton, Mark, useForceDarkPage, useSetupTarget } from './parts';
import { EngineGrid } from './engine-grid';
import { PlanFlow } from './plan-flow';
import { AgentTile, ApprovalArt, ComposerArt, ConnectArt, FindArt, ProveArt, SignalArt } from './section-art';
import { SessionReel } from './session-reel';

/** The company site: this page is one product of it. */
const KORTIX = 'https://kortix.com';

/** The column every section sits in: the site grid, the same as the shared FAQ and footer. */
const COLUMN = 'mx-auto w-full max-w-7xl px-6';
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

/** The page's one action and where to paste it. */
function PromptCta({ prompt, className }: { prompt?: string; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-3', className)}>
      <CopyButton text={prompt} icon="shortcut" />
      <span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-1.5 text-sm">
        Paste it into <Mark name="Claude Code" /> or <Mark name="Codex" />
      </span>
    </div>
  );
}

/** A section's opening: the title, then its lead under it. An action sits on the lead's row, at the right edge. */
function SplitHeading({ title, lead, children }: { title: ReactNode; lead: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className={cn(H2, 'max-w-3xl')}>{title}</h2>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
        <p className={cn(LEAD, 'max-w-3xl')}>{lead}</p>
        {children ? <div className="shrink-0">{children}</div> : null}
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

/**
 * One tall card: the art in the middle, the name and one line at the bottom. Every card keeps an
 * action row, so the titles line up. The light card lights up on hover: a dither rises from its
 * bottom edge at 60%. The dither is a WebGL canvas and a browser keeps only a few alive, so it
 * mounts while a mouse is over the card and unmounts when it leaves.
 */
function TallCard({ art, title, body, action, light }: { art: ReactNode; title: string; body: string; action?: ReactNode; light?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onPointerEnter={(event) => light && event.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        'relative isolate flex flex-col overflow-hidden rounded-xl border p-6 sm:p-8 lg:min-h-[460px]',
        light ? 'bg-foreground text-background border-transparent' : 'border-border bg-card',
      )}
    >
      {hovered ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60 [mask-image:linear-gradient(to_top,#000,transparent_75%)]">
          <div className="animate-in fade-in duration-slower absolute inset-0">
            <DitherField className="text-kortix-base" />
          </div>
        </div>
      ) : null}
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
  useForceDarkPage();
  return (
    <div className="dark bg-background text-foreground relative min-h-screen overflow-x-clip [color-scheme:dark]">
      <header className="border-border bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className={cn(COLUMN, 'flex h-16 items-center justify-between gap-4')}>
          <div className="flex items-center gap-4">
            <a href={KORTIX} aria-label="Kortix" className="text-foreground">
              <KortixLogo size={16} variant="logomark" />
            </a>
            {/* /loopmaxxing on every host: loopmaxxing.sh sends that path to its own root. */}
            <Link href="/loopmaxxing" className="text-foreground hover:text-muted-foreground font-mono text-sm font-medium tracking-wider uppercase transition-colors">
              Loopmaxxing
            </Link>
          </div>
          <nav className="text-muted-foreground hidden items-center gap-8 text-sm md:flex">
            <Link href="#how" className="hover:text-foreground transition-colors">How it works</Link>
            <Link href="#factories" className="hover:text-foreground transition-colors">Factories</Link>
            <Link href="#engine" className="hover:text-foreground transition-colors">kortix.yaml</Link>
            <Link href={`${KORTIX}/docs/developers`} className="hover:text-foreground transition-colors">Docs</Link>
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:contents">
              <GhostButton href={`${KORTIX}/auth`}>Sign in</GhostButton>
            </span>
            <CopyButton size="sm" text={prompt} icon="none" />
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          {/* The Kortix dither as a flat band behind the hero copy: it fades out before the reel. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-60 [mask-image:linear-gradient(to_bottom,#000,transparent_85%),radial-gradient(70%_100%_at_70%_0,#000,transparent)] [mask-composite:intersect]">
            <DitherField className="text-kortix-base" />
          </div>
          <div className={cn(COLUMN, 'relative')}>
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
              art={<ComposerArt tone="light" agent={first?.agent ?? 'factory'} text="Run the tests. File what fails." />}
              title={name}
              body={`1 agent, ${first?.triggers ?? 3} triggers and ${first?.skills ?? 1} ${first?.skills === 1 ? 'skill' : 'skills'}, from a public template your agent adapts to your repo.`}
              action={<CopyButton text={prompt} />}
            />
            <TallCard
              art={<ComposerArt agent="sales" text="Every new signup: research the company, score it and draft the outreach." />}
              title="Any loop you describe"
              body="Say what should happen and when. Your coding agent writes it as code in your repo."
              action={<CopyButton variant="secondary" text={setupPromptFor(target)} />}
            />
            <TallCard art={<ApprovalArt />} title="You approve what ships" body="Every pull request, post and outbound draft waits for a person until you allow more." />
          </div>
          <ul className="mt-20 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-14">
            {TEAMS.map((team) => (
              <li key={team.slug} className="flex flex-col">
                <AgentTile slug={team.slug} size={21} />
                <span className="text-foreground mt-5 text-base font-medium">{team.name}</span>
                <span className="text-muted-foreground mt-1.5 max-w-72 text-base text-pretty">{team.line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={cn(COLUMN, SECTION)}>
          <SplitHeading
            title="Bring the plan you already pay for"
            lead="Connect your Claude or ChatGPT subscription, or any API key."
          />
          <PlanFlow />
        </section>

        <section id="engine" className={cn(COLUMN, SECTION, 'scroll-mt-16')}>
          <SplitHeading
            title="One file in your repo runs all of it"
            lead="The setup adds kortix.yaml. It defines every agent, what starts it and what it may touch. You review it like code."
          />
          <EngineGrid />
        </section>

        <FaqSection
          eyebrow="Frequently asked questions"
          title="The questions developers ask before they paste the prompt."
          items={FAQ.map((item, index) => ({ id: `loopmaxxing-faq-${index + 1}`, question: item.q, answer: item.a }))}
        />
      </main>

      {/* The site's footer: its closing call to action carries this page's copy and the copy action. */}
      <Footer
        linkOrigin={KORTIX}
        themeToggle={false}
        cta={{
          title: 'One prompt.',
          subtitle: 'Your whole company, looped.',
          trust: 'Paste it into Claude Code or Codex. Your agent asks before every decision.',
          actions: (
            <>
              <CopyPromptMarketingButton text={prompt} className="hit-area-y-1 w-full sm:w-auto sm:min-w-36" />
              <MarketingButton variant="secondary" size="md" className="hit-area-y-1 w-full sm:w-auto sm:min-w-36" asChild>
                <Link href={`${KORTIX}/docs/developers`}>Read the docs</Link>
              </MarketingButton>
            </>
          ),
        }}
      />
    </div>
  );
}
