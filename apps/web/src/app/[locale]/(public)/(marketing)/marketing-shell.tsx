'use client';

import { ConsentGate } from '@/components/consent-gate';
import Footer from '@/components/home/footer';
import { Navbar } from '@/components/home/navbar';
import { ANNOUNCEMENT_BAR_HEIGHT, AnnouncementBar } from '@/features/marketing/kit/announcement-bar';
import { Children } from 'react';

// The "Request a demo" modal provider is mounted once in the root layout
// (src/app/[locale]/layout.tsx), so it is available here without a nested provider.

export function MarketingShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const routedChildren = Children.toArray(children);

  return (
    <div className="relative min-h-dvh w-full">
      <ConsentGate />
      {/* The navbar owns the top row and links home, so the desktop Back
          (root layout) steps aside. */}
      <div className="fixed top-0 right-0 left-0 z-50" data-kx-titlebar-owner="">
        <AnnouncementBar />
        <Navbar />
      </div>
      {/* The bar sits above the fixed navbar: the page starts below it by the same height. */}
      <div aria-hidden className={ANNOUNCEMENT_BAR_HEIGHT} />
      {routedChildren}
      <Footer />
    </div>
  );
}
