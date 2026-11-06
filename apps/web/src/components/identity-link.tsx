'use client';

import { browserIdentityPath } from '@/lib/auth/browser-route';
import { isStaticSitePath } from '@/lib/navigation/static-site-path';
import type { UiLinkProps } from '@kortix/ui';
import NextLink from 'next/link';
import { forwardRef } from 'react';

/** Render the selected destination into the anchor for every browser navigation gesture. */
export const IdentityLink = forwardRef<
  HTMLAnchorElement,
  Omit<UiLinkProps, 'ref'> & { currentPathname?: string }
>(function IdentityLink({ currentPathname, ...props }, ref) {
  const href = browserIdentityPath(
    props.href,
    currentPathname ?? (typeof window === 'undefined' ? '' : window.location.pathname),
  );
  if (isStaticSitePath(href)) {
    const { prefetch: _prefetch, ...anchor } = props;
    return <a ref={ref} {...anchor} href={href} />;
  }
  return <NextLink ref={ref} {...props} href={href} />;
});
