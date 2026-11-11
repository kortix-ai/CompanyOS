'use client';

import { useTranslations } from '@/i18n/use-translations';

import Link from '@/components/site-link';
import { MarketingButton } from '@/features/marketing/kit/marketing-button';
import { HeroBand, PageHero } from '@/features/marketing/kit/page-frame';
import { useWalkthrough, WalkPanel, WalkTabs } from '@/features/marketing/kit/walkthrough';
import { Terminal, Window } from '@/features/marketing/kit/window';
import { cn } from '@kortix/ui';

import { localizeMarketingContent as localizeModel } from './model';

/*
 * The /self-hosted hero, in the home page's SandBandHero layout: the two-tone
 * title and one sentence on white, then a band with one terminal. The step
 * strip walks the install (install, configure, start, check) every 4 s until
 * a reader picks a step (never with reduced motion).
 */

const STEP_MS = 4000;

function Walkthrough() {
  const tMarketing = useTranslations('hardcodedUi.i18nComplete');
  const { steps } = localizeModel(tMarketing);

  const { selected, pick } = useWalkthrough(steps.length, STEP_MS);

  const step = steps[selected];
  const fade = 'animate-in fade-in duration-slower ease-out';

  return (
    <div className="flex w-full flex-col items-center gap-8 lg:gap-10">
      <WalkTabs
        steps={steps}
        idPrefix="selfhost-walk"
        label={tMarketing('textd9aa97698883')}
        selected={selected}
        pick={pick}
      />

      <WalkPanel
        idPrefix="selfhost-walk"
        stepId={step.id}
        className="flex w-full max-w-3xl flex-col gap-6"
      >
        {/* A fixed height keeps the band still while the steps change. */}
        <div key={step.id} className={cn('flex min-h-80 flex-col', fade)}>
          <Window title={step.title}>
            <Terminal lines={step.lines} className="px-4 py-4 sm:px-6" wrap />
          </Window>
        </div>
        <p
          key={`line-${step.id}`}
          className={cn('text-foreground px-4 text-center text-base text-balance', fade)}
        >
          {step.line}
        </p>
      </WalkPanel>
    </div>
  );
}

export function SelfHostedHero() {
  const tMarketing = useTranslations('hardcodedUi.i18nComplete');
  const { hero } = localizeModel(tMarketing);

  return (
    <section id="hero" className="relative">
      <PageHero
        title={hero.title}
        titleMuted={hero.titleMuted}
        sub={hero.sub}
        actions={
          <>
            <MarketingButton variant="secondary" size="md" className="hit-area-y-1" asChild>
              <Link href={hero.why.href}>{hero.why.label}</Link>
            </MarketingButton>
            <MarketingButton size="md" className="hit-area-y-1" asChild>
              <Link href={hero.guide.href}>{hero.guide.label}</Link>
            </MarketingButton>
          </>
        }
      />
      <HeroBand caption={hero.caption} captionMuted={hero.captionMuted}>
        <Walkthrough />
      </HeroBand>
    </section>
  );
}
