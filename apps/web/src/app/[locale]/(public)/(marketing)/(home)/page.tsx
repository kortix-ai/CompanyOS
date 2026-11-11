import { CaseStudies } from '@/features/marketing/case-studies/case-studies';
import { PageFrame } from '@/features/marketing/kit/page-frame';
import { SandBandHero } from '@/features/marketing/landing-hero/sand-band-hero';
import { LandingFaqSection } from '@/features/marketing/landing-sections/faq-section';
import { FrameworkBand } from '@/features/marketing/landing-sections/framework-band';
import { HowItWorksTabs } from '@/features/marketing/landing-sections/how-it-works-tabs';
import { PillarsBand } from '@/features/marketing/landing-sections/pillars-band';
import { TrustBand } from '@/features/marketing/landing-sections/trust-band';
import { UseCasesBand } from '@/features/marketing/landing-sections/use-cases-band';
import { WorksWithStrip } from '@/features/marketing/landing-sections/works-with-strip';
import { marketingMetadataLayout } from '@/lib/seo/metadata';

const { generateMetadata } = marketingMetadataLayout('/');

export { generateMetadata };

// The home route is `/[locale]`, so it is the one route a one-segment path such
// as `/security.txt` reaches: the middleware keeps dotted paths off the locale
// rewrite. Every locale is prerendered (the marketing layout's
// `generateStaticParams`), and rendering an unknown one on demand failed with
// "Page changed from static to dynamic at runtime": a 500 on kortix.com
// (KRTX-3255). An unknown value is a 404 without a render, as in
// `solutions/[role]`.
export const dynamicParams = false;

/**
 * The landing page is being rebuilt section by section from the Paper board
 * "Kortix 2". Every section sits inside one 1440px column between two hairline
 * rails; the closing call to action and the footer come from the marketing
 * shell.
 */
export default function Home() {
  return (
    <PageFrame>
      <SandBandHero />
      <WorksWithStrip />
      <CaseStudies />
      <PillarsBand />
      {/* ProblemSolution ("Your know-how is everywhere.") is stashed: hidden
          from the home page by founder call, 2026-10-27; the component stays. */}
      <HowItWorksTabs />
      <FrameworkBand />
      <UseCasesBand />
      <TrustBand />
      <LandingFaqSection />
    </PageFrame>
  );
}
