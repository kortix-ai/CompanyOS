'use client';

import { KortixLogo } from '@kortix/ui/kortix-logo';
import { useBranding } from '@kortix/ui/internal/branding/branding-provider';

import { AuthStoryPane } from '@/features/marketing/auth-story-pane';

/**
 * The frame every Kortix sign-in surface shares (`/auth`, forgot password,
 * reset password): a centered column under the Kortix symbol, with the story
 * pane beside it. KortixLogo swaps in a branded instance's own icon; such an
 * instance gets no story pane, and its column stays centered.
 */
export function useKortixAuthFrame() {
  const branded = useBranding() !== null;
  return {
    centered: true,
    aside: branded ? undefined : <AuthStoryPane />,
    mark: <KortixLogo variant="icon" size={28} className="text-foreground" />,
  };
}
