import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { localeStaticParams } from '@/i18n/static-params';
import { localizedMarketingMetadata } from '@/lib/seo/metadata';

// Prerendered per locale; an unknown locale is a 404 without a render.
export const dynamicParams = false;
// Outside the marketing layout (its own header and footer), so this route prerenders its locales itself.
export const generateStaticParams = localeStaticParams;

export function generateMetadata(): Promise<Metadata> {
  return localizedMarketingMetadata('/loopmaxxing');
}

export default function LoopmaxxingLayout({ children }: { children: ReactNode }) {
  return children;
}
