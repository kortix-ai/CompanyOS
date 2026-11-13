import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { localeStaticParams } from '@/i18n/static-params';
import { localizedMarketingMetadata } from '@/lib/seo/metadata';

// The home route is `/[locale]`, so it is the one route a one-segment path such
// as `/security.txt` reaches: the middleware keeps dotted paths off the locale
// rewrite. Every locale is prerendered (the marketing layout's
// `generateStaticParams`), and rendering an unknown one on demand failed with
// "Page changed from static to dynamic at runtime": a 500 on kortix.com
// (KRTX-3255). An unknown value is a 404 without a render, as in
// `solutions/[role]`.
export const dynamicParams = false;
// Outside the marketing layout, so this route prerenders its locales itself.
export const generateStaticParams = localeStaticParams;

export function generateMetadata(): Promise<Metadata> {
  return localizedMarketingMetadata('/');
}

export default function HomeLayout({ children }: { children: ReactNode }) {
  return children;
}
