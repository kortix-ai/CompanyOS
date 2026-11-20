import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import {
  LOOPMAXXING_DESCRIPTION,
  LOOPMAXXING_OG_IMAGE,
  LOOPMAXXING_ORIGIN,
  LOOPMAXXING_TITLE,
} from '@/features/marketing/one-prompt/seo';
import { loopmaxxingState, requireLoopmaxxing } from '@/lib/loopmaxxing-gate';

// Its own site: the page is canonical at loopmaxxing.sh, and it stays out of
// kortix.com's sitemap and public content list. While the page is off its
// name stays out of the 404; until it is announced search engines skip it.
// The page is always dark: the browser paints its first frame, the address bar and the overscroll dark
// before any CSS loads, so a reader on the light theme never sees a white flash.
export const viewport: Viewport = { colorScheme: 'dark', themeColor: 'black' };

export async function generateMetadata(): Promise<Metadata> {
  const { enabled, announced } = await loopmaxxingState();
  if (!enabled) return {};
  const url = `${LOOPMAXXING_ORIGIN}/`;
  // The whole social card: Next.js replaces the root's openGraph and twitter objects, it does not merge them.
  return {
    title: { absolute: LOOPMAXXING_TITLE },
    description: LOOPMAXXING_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: 'Loopmaxxing by Kortix',
      title: LOOPMAXXING_TITLE,
      description: LOOPMAXXING_DESCRIPTION,
      locale: 'en_US',
      images: [LOOPMAXXING_OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@kortix',
      title: LOOPMAXXING_TITLE,
      description: LOOPMAXXING_DESCRIPTION,
      images: [LOOPMAXXING_OG_IMAGE.url],
    },
    ...(announced ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function LoopmaxxingLayout({ children }: { children: ReactNode }) {
  await requireLoopmaxxing();
  return children;
}
