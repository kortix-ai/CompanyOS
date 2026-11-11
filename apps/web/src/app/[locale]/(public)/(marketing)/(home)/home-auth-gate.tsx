'use client';

import { ProjectPendingScreen } from '@/components/projects/project-pending-screen';
import { useAuth } from '@/features/providers/auth-provider';
import { KORTIX_SUPABASE_AUTH_COOKIE } from '@/lib/supabase/constants';
import { readUnverifiedSession } from '@/lib/supabase/session-cookie';
import { latestProjectPath } from '@kortix/ui/internal/lib/onboarding/last-project-cookie';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, useSyncExternalStore } from 'react';

/**
 * The landing page's client backstop for the stale-cookie window (KRTX-4736).
 *
 * The middleware's fast path (`pathname === '/' && user`) redirects a
 * signed-in visitor into the app only when the identity resolver settles the
 * user, and `cookieIdentityPlan` deliberately declines to create an auth
 * client for an expired or in-margin session cookie (KRTX-2111: a
 * middleware-side refresh rotates the single-use refresh token on a response
 * surface that may drop the Set-Cookie). In exactly that window — the common
 * "returning user opens the bookmarked root" case — the request resolves
 * anonymous and the static prerendered marketing home ships. The browser
 * client then refreshes the session (the only legal writer), the navbar flips
 * to signed-in, and nothing redirects: the visitor stays on the landing
 * indefinitely.
 *
 * This gate covers that window from the client, where the refresh is legal.
 * When the browser holds a session cookie (it is not httpOnly —
 * `createBrowserClient` requires JS read access, see `lib/supabase/client.ts`),
 * the pending frame replaces the landing while `useAuth()` resolves; a
 * signed-in resolution `router.replace()`s into the app through the same
 * machinery the middleware uses (`latestProjectPath`: the owner-validated last
 * project, else the landing door). A signed-out resolution renders the landing
 * and redirects nowhere.
 *
 * The cookie read is a `useSyncExternalStore` snapshot: the server snapshot is
 * always false, so the SSR HTML and the hydration render are identical (the
 * landing), and a no-cookie visitor — every crawler, most first-time visitors
 * — never activates the gate and pays nothing. The cookie cannot change while
 * this component is mounted in a way the gate must react to: a signed-out
 * resolution renders the landing (inactive), and a signed-in resolution leaves
 * the page (`router.replace`), so a static read after hydration is enough.
 *
 * Loop and open-redirect safety: the destination comes only from
 * `latestProjectPath` (a UUID-shaped project id or `PROJECT_LANDING_PATH`),
 * never from query params; `replace` keeps `/` out of the history so Back
 * never re-enters the bounce; a stale-but-dead session resolves signed-out and
 * renders the landing. The middleware's server-side redirect stays the first
 * responder for every request whose identity it can settle; this gate is the
 * backstop for the window the middleware must not touch.
 */
function browserHoldsSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const cookies = document.cookie.split(';').map((entry) => {
    const separator = entry.indexOf('=');
    if (separator === -1) return { name: entry.trim(), value: '' };
    return { name: entry.slice(0, separator).trim(), value: entry.slice(separator + 1).trim() };
  });
  return readUnverifiedSession(cookies, KORTIX_SUPABASE_AUTH_COOKIE) !== null;
}

/** The snapshot is read once after hydration and never re-subscribed. */
const subscribeNoop = () => () => {};

export function HomeAuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const holdsSessionCookie = useSyncExternalStore(
    subscribeNoop,
    browserHoldsSessionCookie,
    () => false,
  );

  useEffect(() => {
    // The redirect runs only for an activated (session-cookie) visitor: a
    // visitor with no cookie never activates the gate, so it never redirects.
    if (!holdsSessionCookie || isLoading || !user) return;
    router.replace(latestProjectPath(user.id));
  }, [holdsSessionCookie, isLoading, router, user]);

  if (!holdsSessionCookie || (!isLoading && !user)) return <>{children}</>;
  return (
    // Covers the marketing chrome (the navbar sits at z-50) so the visitor
    // never sees the signed-in navbar over the marketing home — the reported
    // screenshot state.
    <div className="fixed inset-0 z-[60] bg-background">
      <ProjectPendingScreen />
    </div>
  );
}
