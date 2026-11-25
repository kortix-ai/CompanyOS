import { ConsentGate } from '@/components/consent-gate';
import { DownloadCloseButton } from '@/features/marketing/download/close-button';
import { localizedDownloadContent } from '@/features/marketing/download/content';
import { GetKortixGrid } from '@kortix/ui/internal/apps-and-extensions/get-kortix-grid';
import { detectPlatform, normalizePlatform } from '@kortix/ui/internal/lib/detect-os';
import { getTranslations } from '@/i18n/get-translations';
import { localizedMarketingMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';
import { headers } from 'next/headers';

export function generateMetadata(): Promise<Metadata> {
  return localizedMarketingMetadata('/download');
}

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>;
}) {
  const [headerList, params, tI18nComplete] = await Promise.all([
    headers(),
    searchParams,
    getTranslations('hardcodedUi.i18nComplete'),
  ]);
  const { hero } = localizedDownloadContent(tI18nComplete);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center px-6 py-16">
      <ConsentGate />

      {/* This route renders no nav and no footer, so the X is the way out. */}
      <DownloadCloseButton />

      <header className="mb-10 text-center">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {hero.title}
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-md text-balance">{hero.sub}</p>
      </header>

      {/* The same cards as the in-app "Apps and extensions" dialog, without
          the signed-in state. */}
      <GetKortixGrid
        platform={normalizePlatform(params.platform) ?? detectPlatform(headerList.get('user-agent'))}
      />
    </main>
  );
}
