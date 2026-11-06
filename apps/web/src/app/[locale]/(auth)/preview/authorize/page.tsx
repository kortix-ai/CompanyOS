'use client';

/**
 * The hand-off that turns "you are signed in to Kortix" into "this preview
 * origin will serve you".
 *
 * A preview lives on its own hostname (`{env}-p{port}-{sandbox}.p.kortix.com`),
 * which is exactly what makes an arbitrary app work there — and also means none
 * of the web app's credentials reach it. Opening such a URL cold gets a page
 * asking to sign in; that page sends the person here with `?to=<preview url>`.
 *
 * Here we are on the Kortix origin, so we have the session. We take the access
 * token through the SDK and bounce back with a preview ticket, which the proxy exchanges
 * for a host-scoped cookie and strips from the address bar.
 *
 * `to` is attacker-controllable, so it is validated against the preview
 * hostname shape this deployment actually serves before we ever redirect to it.
 * Without that check this page would be an open redirect that also hands over a
 * bearer token.
 */

import { useRouter } from '@/lib/navigation/use-identity-router';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import {
  PreviewAuthorizeView,
  type PreviewAuthorizeState,
} from '@/features/auth/preview-authorize-view';
import { useAuth } from '@/features/providers/auth-provider';
import { getEnv } from '@/lib/env-config';
import { authorizePreviewUrl, loadPreviewUrlTemplate } from '@kortix/sdk';
import { AuthPendingScreen } from '@kortix/ui/internal/auth/auth-consent';

/**
 * True only for a URL on a hostname this deployment serves previews on.
 *
 * The template gives the exact origin shape; we compare the host SUFFIX and the
 * label form rather than string-matching the whole URL, because the port and
 * sandbox vary. Anything else — another domain, a lookalike, a path on our own
 * app — is refused.
 */
export function isServablePreviewUrl(candidate: string, template: string | null): boolean {
  if (!template) return false;
  let url: URL;
  let shape: URL;
  try {
    url = new URL(candidate);
    shape = new URL(template.replace('{port}', '1').replace('{sandbox}', 'x'));
  } catch {
    return false;
  }
  if (url.protocol !== shape.protocol) return false;

  if (url.port !== shape.port || url.username || url.password) return false;
  const marker = '65000-kortixpreviewplaceholder';
  const trusted = new URL(
    template.replace('{port}', '65000').replace('{sandbox}', 'kortixpreviewplaceholder'),
  );
  const parts = trusted.hostname.split(marker);
  if (parts.length !== 2) return false;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compact = (
    { 'dev-p': 'd-p', 'staging-p': 's-p', 'prod-p': 'p-p', 'preview-p': 'r-p' } as Record<
      string,
      string
    >
  )[parts[0]];
  const prefix = compact ? `(?:${escape(parts[0])}|${escape(compact)})` : escape(parts[0]);
  return new RegExp(`^${prefix}\\d{1,5}-[a-z0-9-]+${escape(parts[1])}$`).test(url.hostname);
}

export default function PreviewAuthorizePage() {
  return (
    <Suspense fallback={<AuthPendingScreen />}>
      <PreviewAuthorize />
    </Suspense>
  );
}

function PreviewAuthorize() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [failure, setFailure] = useState<Exclude<PreviewAuthorizeState, 'opening'> | null>(null);
  const to = searchParams.get('to') || '';
  // Come back here once signed in, carrying `to` untouched.
  const signInUrl = `/auth?returnUrl=${encodeURIComponent(
    `/preview/authorize?to=${encodeURIComponent(to)}`,
  )}`;

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      // `replace`, not `push`: this page is a hand-off, and leaving it in
      // history means Back lands on a page that immediately redirects again.
      router.replace(signInUrl);
      return;
    }

    let cancelled = false;
    (async () => {
      const backendUrl = getEnv().BACKEND_URL || '';
      let template = await loadPreviewUrlTemplate(backendUrl);
      const backend = new URL(backendUrl, window.location.origin);
      if (
        !template &&
        backend.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname)
      ) {
        template = `http://p{port}-{sandbox}.localhost:${backend.port || '80'}`;
      }
      if (cancelled) return;

      if (!isServablePreviewUrl(to, template)) {
        setFailure('not-served');
        return;
      }

      const target = await authorizePreviewUrl(to, { serverUrl: backendUrl });
      if (!cancelled) window.location.replace(target);
    })().catch(() => {
      if (!cancelled) setFailure('expired');
    });

    return () => {
      cancelled = true;
    };
  }, [user, isLoading, to, router, signInUrl]);

  // Until the session is known there is nothing true to say about the preview.
  if (isLoading || !user) return <AuthPendingScreen />;

  return (
    <PreviewAuthorizeView
      state={failure ?? 'opening'}
      to={to}
      email={user.email ?? null}
      onSignInAgain={() => router.replace(signInUrl)}
    />
  );
}
