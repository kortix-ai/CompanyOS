'use client';

import { useBranding } from '@kortix/ui/internal/branding/branding-provider';

import { AuthStoryPane } from '@/features/marketing/auth-story-pane';

/**
 * The Kortix app tile above every sign-in heading: the same square the
 * use-case covers carry, as a 96px copy (2x for 48px) of the 1000px cover.
 */
export function KortixTile() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static 8KB tile; next/image pulls the Next runtime into the auth page tests
    <img
      src="/usecases/logos/kortix-96.png"
      alt=""
      width={48}
      height={48}
      decoding="async"
      className="size-12 rounded-md object-cover"
    />
  );
}

/**
 * The frame every Kortix sign-in surface shares (`/auth`, forgot password,
 * reset password): a centered column under the Kortix tile, with the story
 * pane beside it. A branded instance keeps its own mark (KortixLogo swaps
 * it) and gets no pane; its column stays centered.
 */
export function useKortixAuthFrame() {
  const branded = useBranding() !== null;
  return {
    centered: true,
    aside: branded ? undefined : <AuthStoryPane />,
    mark: branded ? undefined : <KortixTile />,
  };
}
