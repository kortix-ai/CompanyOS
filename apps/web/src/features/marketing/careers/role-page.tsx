'use client';

import { MarketingButton } from '@/features/marketing/kit/marketing-button';
import {
  Band,
  Block,
  CellGrid,
  Heading,
  KeyRows,
  PageFrame,
  PageHero,
  SpecGrid,
} from '@/features/marketing/kit/page-frame';
import { useTranslations } from '@/i18n/use-translations';
import Link from '@/components/site-link';
import { useState, type ReactNode } from 'react';
import { ApplyModal } from './apply-modal';
import { getLocalizedCareersContent, type RoleSlug } from './content';

/**
 * `/careers/<slug>`: one opening, in the same frame as `/careers`. The hero
 * and the facts, what the role owns, the first 12 months, the non-negotiables,
 * the principles ("How we sell" for GTM, "How we build" for MTS and FDE), and
 * how we hire.
 * Apply opens `ApplyModal` with this opening pre-selected.
 */
export function RolePage({ slug }: { slug: RoleSlug }): ReactNode {
  const tI18nComplete = useTranslations('hardcodedUi.i18nComplete');
  const { hero, roles, apply } = getLocalizedCareersContent(tI18nComplete);
  const role = roles[slug];
  const [applyOpen, setApplyOpen] = useState(false);
  const openApply = () => setApplyOpen(true);
  const applyButton = (
    <MarketingButton size="md" className="hit-area-y-1" onClick={openApply}>
      {apply.cta}
    </MarketingButton>
  );

  return (
    <PageFrame>
      <PageHero
        title={role.hero.title}
        titleMuted={role.hero.titleMuted}
        sub={role.hero.sub}
        actions={
          <>
            <MarketingButton size="md" className="hit-area-y-1" variant="secondary" asChild>
              <Link href="/careers">{hero.allOpenings}</Link>
            </MarketingButton>
            {applyButton}
          </>
        }
      />
      <Band>
        <SpecGrid items={role.facts} cols="lg:grid-cols-4" />
      </Band>

      <Block id="own">
        <Heading title={role.own.title} titleMuted={role.own.titleMuted} />
        <Band className="mt-12">
          <KeyRows rows={role.own.rows} />
        </Band>
      </Block>

      <Block id="first-year">
        <Heading title={role.year.title} titleMuted={role.year.titleMuted} />
        <Band className="mt-12">
          <CellGrid items={role.year.items} cols="lg:grid-cols-4" />
        </Band>
      </Block>

      <Block id="you">
        <Heading title={role.have.title} titleMuted={role.have.titleMuted} />
        <Band className="mt-12">
          <KeyRows rows={role.have.rows} />
        </Band>
      </Block>

      <Block id="principles">
        <Heading
          title={role.principles.title}
          titleMuted={role.principles.titleMuted}
          sub={role.principles.sub}
        />
        <Band className="mt-12">
          <CellGrid items={role.principles.items} cols="lg:grid-cols-4" />
        </Band>
      </Block>

      <Block id="apply">
        <Heading title={role.process.title} titleMuted={role.process.titleMuted} actions={applyButton} />
        <Band className="mt-12">
          <KeyRows rows={role.process.rows} />
        </Band>
      </Block>

      <ApplyModal open={applyOpen} onOpenChange={setApplyOpen} defaultArea={role.applyArea} />
    </PageFrame>
  );
}
