'use client';

import { useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';
import { browserIdentityPath, parseBrowserRoute } from '@/lib/auth/browser-route';
import { browserDocumentIdentity } from '@/lib/auth/browser-document';

/** All imperative host navigation, including the UI provider, uses this adapter. */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => {
    const path = (href: string) => typeof window === 'undefined'
      ? href : browserIdentityPath(href, window.location.pathname);
    const navigate = (href: string, replace: boolean, options?: Parameters<typeof router.push>[1]) => {
      const destination = path(href);
      if (typeof window !== 'undefined' && destination.startsWith('/') && !destination.startsWith('//')) {
        const current = parseBrowserRoute(window.location.pathname);
        const next = parseBrowserRoute(destination.split(/[?#]/)[0]);
        if (current?.slot !== next?.slot && (current || next)) {
          // Fence token dispatch before unloading the old runtime and its connections.
          browserDocumentIdentity()?.select(null);
          if (replace) window.location.replace(destination);
          else window.location.assign(destination);
          return;
        }
      }
      if (replace) router.replace(destination, options);
      else router.push(destination, options);
    };
    return {
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => navigate(href, false, options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => navigate(href, true, options),
      prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(path(href), options),
    };
  }, [router]);
}
