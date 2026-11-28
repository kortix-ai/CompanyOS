'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  EnvelopeSimpleIcon,
  UserIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useTranslations } from '@/i18n/use-translations';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { cn } from '@kortix/ui';
import { Button } from '@kortix/ui/button';
import { AuthLegalFooter } from '@kortix/ui/internal/auth/auth-card-shell';
import { Rise } from '@kortix/ui/internal/auth/auth-primitives';
import { MicrosoftTeams } from '@kortix/ui/internal/icons/microsoft-teams';
import { Slack } from '@kortix/ui/internal/icons/slack';
import { KortixLogo } from '@kortix/ui/kortix-logo';
import { OnboardingArt } from '@kortix/ui/workspace/home/onboarding-art';

import { signupAuthHref } from './signup-handoff';

/** Where the team talks. Only the live channels (claims.md: Slack, Teams, email). */
type TeamChannel = 'slack' | 'teams' | 'email' | 'solo';

const STEPS = ['team', 'alone', 'together', 'memory', 'tools', 'work', 'finish'] as const;
type Step = (typeof STEPS)[number];

/**
 * `/signup`: what Kortix is, one idea per screen, before the account. It asks
 * for nothing personal and writes nothing: every exit is a link to `/auth`
 * with the query this page arrived with (`signup-handoff.ts`). Reloading starts
 * the explanation again, which costs nothing.
 */
export function SignupWizard({ params }: { params: URLSearchParams }) {
  const t = useTranslations('signup');
  const [index, setIndex] = useState(0);
  const [channel, setChannel] = useState<TeamChannel | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const authHref = signupAuthHref(params);
  const step: Step = STEPS[index];
  const last = index === STEPS.length - 1;

  // A step change moves focus to the new heading, so a screen reader reads the
  // screen that replaced the old one. Not on first paint: the page just loaded.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
  }, [index]);

  const go = (next: number) => {
    moved.current = true;
    setIndex(Math.max(0, Math.min(STEPS.length - 1, next)));
  };

  const pickChannel = (value: TeamChannel) => {
    setChannel(value);
    go(index + 1);
  };

  const channelName = channel === 'slack' ? 'Slack' : channel === 'teams' ? t('team.teams') : null;

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
        <Link href="/" aria-label={t('home')} className="hit-area-3 inline-flex">
          <KortixLogo variant="icon" size={24} className="text-foreground" />
        </Link>
        <Button asChild variant="ghost" size="sm" className="hit-area-y-2">
          <Link href={authHref}>{t('signIn')}</Link>
        </Button>
      </header>

      <div className="mx-auto w-full max-w-xs px-6">
        <div
          role="progressbar"
          aria-label={t('progress', { current: index + 1, total: STEPS.length })}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={index + 1}
          className="bg-muted h-1 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-foreground duration-moderate h-full w-full origin-left transition-transform ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${(index + 1) / STEPS.length})` }}
          />
        </div>
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <Rise key={step}>
            <OnboardingArt
              kind={step === 'together' ? 'workspace' : step === 'memory' ? 'framework' : step}
              label={t('art.workspace')}
              detail={step === 'work' ? t('art.changeTitle') : t('art.shared')}
            />
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-foreground text-2xl font-medium tracking-tight text-balance outline-none"
            >
              {t(`${step}.title`)}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm text-pretty">
              {t(`${step}.description`)}
            </p>
            {step === 'tools' && channelName ? (
              <p className="text-muted-foreground mt-2 text-sm text-pretty">
                {t('tools.channel', { channel: channelName })}
              </p>
            ) : null}

            {step === 'team' ? (
              <ChannelPicker value={channel} onPick={pickChannel} />
            ) : step === 'finish' ? (
              <FinishPoints />
            ) : null}

            <div className="mt-8 flex flex-col gap-2">
              {last ? (
                <Button asChild size="lg" className="hit-area-y-1 w-full">
                  <Link href={authHref} onClick={trackCtaSignup}>
                    {t('finish.cta')}
                    <ArrowRightIcon className="size-4 shrink-0" />
                  </Link>
                </Button>
              ) : step === 'team' ? null : (
                <Button
                  type="button"
                  size="lg"
                  className="hit-area-y-1 w-full"
                  onClick={() => go(index + 1)}
                >
                  {t('continue')}
                  <ArrowRightIcon className="size-4 shrink-0" />
                </Button>
              )}
              <div className="flex items-center justify-between gap-2">
                {index > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="hit-area-y-2 gap-1.5"
                    onClick={() => go(index - 1)}
                  >
                    <ArrowLeftIcon className="size-3.5 shrink-0" />
                    {t('back')}
                  </Button>
                ) : (
                  <span />
                )}
                {last ? (
                  <Button asChild variant="ghost" size="sm" className="hit-area-y-2">
                    <Link href={authHref}>{t('finish.signIn')}</Link>
                  </Button>
                ) : (
                  <Button asChild variant="ghost" size="sm" className="hit-area-y-2">
                    <Link href={authHref}>{t('skip')}</Link>
                  </Button>
                )}
              </div>
            </div>
          </Rise>
        </div>
      </main>

      <AuthLegalFooter centered />
    </div>
  );
}

function ChannelPicker({
  value,
  onPick,
}: {
  value: TeamChannel | null;
  onPick: (value: TeamChannel) => void;
}) {
  const t = useTranslations('signup');
  const options: Array<{ id: TeamChannel; label: string; mark: React.ReactNode }> = [
    { id: 'slack', label: 'Slack', mark: <Slack className="size-5" /> },
    { id: 'teams', label: t('team.teams'), mark: <MicrosoftTeams className="size-5" /> },
    {
      id: 'email',
      label: t('team.email'),
      mark: <EnvelopeSimpleIcon className="text-muted-foreground size-5" />,
    },
    {
      id: 'solo',
      label: t('team.solo'),
      mark: <UserIcon className="text-muted-foreground size-5" />,
    },
  ];
  return (
    <div
      role="group"
      aria-label={t('team.title')}
      className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onPick(option.id)}
          className={cn(
            'bg-popover text-foreground hover:bg-accent duration-fast flex min-h-16 items-center gap-3 rounded-md border px-3 text-left text-sm transition-colors',
            value === option.id && 'border-foreground',
          )}
        >
          {/* The connector banner's tile: background, hairline border. */}
          <span
            aria-hidden
            className="bg-background flex size-10 shrink-0 items-center justify-center rounded-sm border"
          >
            {option.mark}
          </span>
          <span className="min-w-0 truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function FinishPoints() {
  const t = useTranslations('signup');
  return (
    <ul className="mt-6 flex flex-col gap-3">
      {(['pointOpen', 'pointModels', 'pointHost'] as const).map((key) => (
        <li key={key} className="text-foreground flex items-start gap-3 text-sm">
          <CheckIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          {t(`finish.${key}`)}
        </li>
      ))}
    </ul>
  );
}
