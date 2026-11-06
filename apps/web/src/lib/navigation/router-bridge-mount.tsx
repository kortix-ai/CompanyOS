'use client';

import { browserIdentityPath } from '@/lib/auth/browser-route';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { registerAppRouter } from '@kortix/ui/internal/lib/navigation/router-bridge';

/**
 * Publishes the App Router instance to `router-bridge.ts` so non-component
 * modules (stores, error handlers, the notification callback) can navigate
 * without a full page reload. Mounted once, in the root layout.
 *
 * Registration happens in an effect, not during render: writing module state
 * while rendering is a side effect React may discard or replay.
 */
export function RouterBridge() {
  const router = useRouter();
  useEffect(() => {
    const path = (href: string) => browserIdentityPath(href, window.location.pathname);
    registerAppRouter({ ...router, push: (href, options) => router.push(path(href), options), replace: (href, options) => router.replace(path(href), options) });
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.('a');
      if (!anchor || anchor.target || anchor.download || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const href = url.pathname + url.search + url.hash;
      const selected = path(href);
      if (selected === href) return;
      event.preventDefault();
      event.stopPropagation();
      router.push(selected);
    };
    document.addEventListener('click', click, true);
    return () => { document.removeEventListener('click', click, true); registerAppRouter(null); };
  }, [router]);
  return null;
}
