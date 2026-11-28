'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { useBranding } from '@kortix/ui/internal/branding/branding-provider';

import { bypassesSignupIntro, signupAuthHref } from '@/features/auth/signup-wizard/signup-handoff';
import { SignupWizard } from '@/features/auth/signup-wizard/signup-wizard';

/**
 * `/signup`: "Get started" lands here. It explains Kortix, then hands over to
 * `/auth`, which alone creates the account or signs a person in. A visit that
 * carries an auth flow in progress goes to `/auth` at once, and so does every
 * visit to a branded instance: the explanation is Kortix's own story. (A
 * self-host with the marketing site off never reaches this page: the
 * middleware forwards it.)
 */
function SignupPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = new URLSearchParams(searchParams.toString());
  const branded = useBranding() !== null;
  const bypass = branded || bypassesSignupIntro(params);
  const authHref = signupAuthHref(params);

  useEffect(() => {
    if (bypass) router.replace(authHref);
  }, [bypass, authHref, router]);

  if (bypass) return <div className="bg-background min-h-svh" />;
  return <SignupWizard params={params} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="bg-background min-h-svh" />}>
      <SignupPage />
    </Suspense>
  );
}
