import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

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
  return {
    title: 'Loopmaxxing by Kortix: add a software factory to your repo with 1 prompt',
    description:
      'For dev teams. Agents that work on your repo and your tools, in the cloud, 24/7. One prompt sets them up, on the Claude or Codex subscription or API key you already pay for.',
    alternates: { canonical: 'https://loopmaxxing.sh' },
    ...(announced ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function LoopmaxxingLayout({ children }: { children: ReactNode }) {
  await requireLoopmaxxing();
  return children;
}
