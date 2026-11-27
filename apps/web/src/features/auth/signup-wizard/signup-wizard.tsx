'use client';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  EnvelopeSimpleIcon,
  FileIcon,
  FolderIcon,
  GitPullRequestIcon,
  UserIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useTranslations } from '@/i18n/use-translations';
import { trackCtaSignup } from '@/lib/analytics/gtm';
import { FULL_COLOR_LOGOS, WORKS_WITH } from '@/features/marketing/landing-sections/works-with-logos';
import { Button } from '@kortix/ui/button';
import { KortixLogo } from '@kortix/ui/kortix-logo';
import { cn } from '@kortix/ui';
import { AuthLegalFooter } from '@kortix/ui/internal/auth/auth-card-shell';
import { Rise } from '@kortix/ui/internal/auth/auth-primitives';
import { MicrosoftTeams } from '@kortix/ui/internal/icons/microsoft-teams';
import { Slack } from '@kortix/ui/internal/icons/slack';

import { signupAuthHref } from './signup-handoff';

/** Where the team talks. Only the live channels (claims.md: Slack, Teams, email). */
type TeamChannel = 'slack' | 'teams' | 'email' | 'solo';

const STEPS = ['team', 'alone', 'together', 'memory', 'tools', 'work', 'finish'] as const;
type Step = (typeof STEPS)[number];

/** The repository a workspace is: the real top-level layout of a Kortix project. */
const REPO_TREE = [
  { name: 'kortix.yaml', folder: false },
  { name: 'agents/', folder: true },
  { name: 'skills/', folder: true },
  { name: 'memory/', folder: true },
  { name: 'connectors/', folder: true },
] as const;

/** Capabilities, not customers: the same rule as the landing works-with strip. */
const TOOL_SLUGS = [
  'slack',
  'github',
  'notion',
  'linear',
  'gmail',
  'googledrive',
  'googlecalendar',
  'figma',
  'hubspot',
  'jira',
  'stripe',
  'salesforce',
] as const;
const TOOLS = TOOL_SLUGS.map((slug) => WORKS_WITH.find((logo) => logo.slug === slug)).filter(
  (logo): logo is (typeof WORKS_WITH)[number] => Boolean(logo),
);

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
            className="bg-foreground h-full w-full origin-left transition-transform duration-moderate ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${(index + 1) / STEPS.length})` }}
          />
        </div>
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Rise key={step}>
            {step !== 'team' && step !== 'finish' ? <StepArt step={step} /> : null}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-foreground text-2xl font-medium tracking-tight text-balance outline-none"
            >
              {t(`${step}.title`)}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm text-pretty">{t(`${step}.description`)}</p>
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
                <Button type="button" size="lg" className="hit-area-y-1 w-full" onClick={() => go(index + 1)}>
                  {t('continue')}
                  <ArrowRightIcon className="size-4 shrink-0" />
                </Button>
              )}
              <div className="flex items-center justify-between gap-2">
                {index > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="hit-area-y-2 gap-1.5" onClick={() => go(index - 1)}>
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
    { id: 'slack', label: 'Slack', mark: <Slack className="size-3.5" /> },
    { id: 'teams', label: t('team.teams'), mark: <MicrosoftTeams className="size-3.5" /> },
    { id: 'email', label: t('team.email'), mark: <EnvelopeSimpleIcon className="text-muted-foreground size-3.5" /> },
    { id: 'solo', label: t('team.solo'), mark: <UserIcon className="text-muted-foreground size-3.5" /> },
  ];
  return (
    <div role="group" aria-label={t('team.title')} className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onPick(option.id)}
          className={cn(
            'bg-popover text-foreground hover:bg-accent flex h-12 items-center gap-3 rounded-md border px-3 text-left text-sm transition-colors duration-fast',
            value === option.id && 'border-foreground',
          )}
        >
          {/* The connector banner's tile: background, hairline border. */}
          <span aria-hidden className="bg-background flex size-6 shrink-0 items-center justify-center rounded-sm border">
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

/** One picture per idea, drawn from real product nouns, never a fake screenshot. */
function StepArt({ step }: { step: Exclude<Step, 'team' | 'finish'> }) {
  const t = useTranslations('signup');
  return (
    <div aria-hidden className="mb-8 flex h-40 items-center justify-center">
      {step === 'alone' ? (
        <div className="flex gap-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="bg-popover flex w-24 flex-col gap-1.5 rounded-md border p-2.5">
              <UserIcon className="text-muted-foreground size-3.5" />
              <span className="bg-muted h-1.5 w-full rounded-full" />
              <span className="bg-muted h-1.5 w-2/3 rounded-full" />
              <span className="bg-muted h-1.5 w-4/5 rounded-full" />
            </div>
          ))}
        </div>
      ) : step === 'together' ? (
        <div className="bg-popover flex w-64 flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <KortixLogo variant="icon" size={16} className="text-foreground" />
            <span className="text-foreground text-sm font-medium">{t('art.workspace')}</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <UsersThreeIcon className="size-3.5 shrink-0" />
            {t('art.shared')}
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((n) => (
              <span key={n} className="bg-background flex size-7 items-center justify-center rounded-full border">
                <UserIcon className="text-muted-foreground size-3.5" />
              </span>
            ))}
            <span className="bg-background flex size-7 items-center justify-center rounded-full border">
              <KortixLogo variant="icon" size={12} className="text-foreground" />
            </span>
          </div>
        </div>
      ) : step === 'memory' ? (
        <ul className="bg-popover w-56 rounded-md border py-1.5 font-mono text-xs">
          {REPO_TREE.map((entry) => (
            <li key={entry.name} className="text-muted-foreground flex items-center gap-2 px-3 py-1">
              {entry.folder ? (
                <FolderIcon className="size-3.5 shrink-0" />
              ) : (
                <FileIcon className="size-3.5 shrink-0" />
              )}
              <span className={entry.folder ? undefined : 'text-foreground'}>{entry.name}</span>
            </li>
          ))}
        </ul>
      ) : step === 'tools' ? (
        <ul className="grid grid-cols-6 gap-2">
          {TOOLS.map((logo) => (
            <li key={logo.slug} className="bg-popover flex size-11 items-center justify-center rounded-md border">
              {FULL_COLOR_LOGOS.has(logo.slug) ? (
                // eslint-disable-next-line @next/next/no-img-element -- a 20px static SVG; next/image adds nothing here
                <img
                  src={`/media/landing/logos/color/${logo.slug}.svg`}
                  alt=""
                  decoding="async"
                  className="size-5 object-contain"
                />
              ) : (
                <span
                  className="bg-foreground size-5"
                  style={{
                    maskImage: `url(/media/landing/logos/${logo.slug}.svg)`,
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="bg-popover flex w-72 flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <GitPullRequestIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="text-foreground min-w-0 truncate text-sm">{t('art.changeTitle')}</span>
          </div>
          <span className="text-muted-foreground text-xs">{t('art.changeMeta')}</span>
          <div className="flex justify-end">
            <span className="bg-foreground text-background rounded-sm px-2 py-0.5 text-xs">{t('art.review')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
