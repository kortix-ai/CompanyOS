'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { setupPromptFor } from '@kortix/shared/setup-guide';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';

import { AUDIENCE_BOOT, AUDIENCE_KEY, ENTERPRISE_PATH, decide, rememberAudience, type Audience } from './audience';
import { useSetupTarget } from './parts';

/** How long the chosen half takes to fill the screen before the page behind it shows. */
const LEAVE_MS = 500;

const noSubscription = () => () => {};

const TEAMS = ['Engineering', 'Marketing', 'Sales', 'Support', 'Operations'];

/**
 * The first screen of kortix.com for a new visitor: two halves, one question.
 * "Developer" opens the one-prompt page that is already rendered behind the
 * gate; "Enterprise" goes to the CompanyOS page. The choice is remembered, and
 * the header of each page switches it. The page behind is in the HTML, so a
 * crawler and a browser without JavaScript read the developer page.
 */
export function AudienceGate() {
  const router = useRouter();
  const prompt = setupPromptFor(useSetupTarget());
  const [hover, setHover] = useState<Audience | null>(null);
  const [leaving, setLeaving] = useState<Audience | null>(null);
  const [closed, setClosed] = useState(false);
  const reducedMotion = useSyncExternalStore(
    noSubscription,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  // An inline script does not run on a client-side navigation: decide again on mount.
  useLayoutEffect(() => {
    decide(AUDIENCE_KEY, ENTERPRISE_PATH);
  }, []);

  // The page behind must not scroll while the gate covers it.
  useEffect(() => {
    const root = document.documentElement;
    if (closed || root.dataset.audience) return;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = before;
    };
  }, [closed]);

  const choose = (audience: Audience) => {
    if (leaving) return;
    rememberAudience(audience);
    setLeaving(audience);
    const done = () => {
      if (audience === 'enterprise') {
        router.push(`${window.location.pathname.replace(/\/$/, '')}/${ENTERPRISE_PATH}`);
        return;
      }
      document.documentElement.dataset.audience = audience;
      setClosed(true);
    };
    if (reducedMotion) done();
    else window.setTimeout(done, LEAVE_MS);
  };

  const grow = (side: Audience) =>
    leaving ? (leaving === side ? 'flex-[1_1_100%]' : 'flex-[0_0_0%] opacity-0') : hover === side ? 'flex-[1.25_1_0%]' : hover ? 'flex-[0.85_1_0%]' : 'flex-[1_1_0%]';
  const half = 'group relative flex min-h-0 min-w-0 cursor-pointer flex-col justify-between overflow-hidden p-8 text-left outline-none transition-[flex,opacity] duration-slow ease-out motion-reduce:transition-none md:p-12 lg:p-16';

  return (
    <>
      {/* Runs before the first paint in the server HTML. A script React renders on the
          client never runs, so there it is inert text and the layout effect decides. */}
      <script suppressHydrationWarning type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'} dangerouslySetInnerHTML={{ __html: AUDIENCE_BOOT }} />
      <noscript>
        <style>{'#audience-gate{display:none}'}</style>
      </noscript>
      {closed ? null : (
        <div
          id="audience-gate"
          role="dialog"
          aria-modal="true"
          aria-label="Choose your Kortix"
          className={cn(
            'fixed inset-0 z-50 flex flex-col md:flex-row [html[data-audience]_&]:hidden',
            leaving === 'developer' && 'animate-out fade-out fill-mode-forwards delay-300 duration-moderate motion-reduce:animate-none',
          )}
        >
          <button
            type="button"
            autoFocus
            onClick={() => choose('developer')}
            onMouseEnter={() => setHover('developer')}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover('developer')}
            className={cn('dark bg-background text-foreground', half, grow('developer'))}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-slow [mask-image:linear-gradient(to_bottom,transparent_20%,#000)] group-hover:opacity-100 group-focus-visible:opacity-100">
              <DitherField className="text-kortix-base" />
            </div>
            <span className="relative flex items-center gap-3">
              <KortixLogo size={16} variant="logomark" />
              <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">For developers</span>
            </span>
            <span className="relative flex flex-col gap-6">
              <span className="border-border bg-card/80 text-foreground hidden max-w-md rounded-lg border p-4 font-mono text-xs leading-5 whitespace-pre-wrap backdrop-blur lg:block">
                {prompt}
              </span>
              <span className="text-4xl leading-none font-medium tracking-tight sm:text-5xl lg:text-6xl">One prompt.</span>
              <span className="text-muted-foreground max-w-md text-base text-pretty lg:text-lg">
                Agents on your repo, 24/7. Set up by the coding agent you already use.
              </span>
              <span className="text-foreground flex items-center gap-2 text-sm font-medium">
                Build with Kortix
                <span aria-hidden className="transition-transform duration-moderate group-hover:translate-x-1 group-focus-visible:translate-x-1">→</span>
              </span>
            </span>
          </button>

          <button
            type="button"
            data-theme-preview="pure-light"
            onClick={() => choose('enterprise')}
            onMouseEnter={() => setHover('enterprise')}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover('enterprise')}
            className={cn('bg-background text-foreground border-border border-t md:border-t-0 md:border-l', half, grow('enterprise'))}
          >
            <span className="relative flex items-center gap-3 md:justify-end">
              <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">For enterprises</span>
            </span>
            <span className="relative flex flex-col gap-6">
              <span className="border-border bg-card hidden max-w-md flex-col rounded-lg border lg:flex">
                {TEAMS.map((team) => (
                  <span key={team} className="border-border flex items-center justify-between border-b px-4 py-2 text-sm last:border-b-0">
                    {team}
                    <span className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
                      <span aria-hidden className="bg-kortix-base size-1.5 rounded-full opacity-40 transition-opacity duration-slow group-hover:opacity-100 group-focus-visible:opacity-100" />
                      agents running
                    </span>
                  </span>
                ))}
              </span>
              <span className="text-4xl leading-none font-medium tracking-tight sm:text-5xl lg:text-6xl">The CompanyOS.</span>
              <span className="text-muted-foreground max-w-md text-base text-pretty lg:text-lg">
                Agents for every team, on your tools and context. Open source, in our cloud or yours.
              </span>
              <span className="text-foreground flex items-center gap-2 text-sm font-medium">
                Run your company on Kortix
                <span aria-hidden className="transition-transform duration-moderate group-hover:translate-x-1 group-focus-visible:translate-x-1">→</span>
              </span>
            </span>
          </button>
        </div>
      )}
    </>
  );
}

/** The header control of the developer page: where you are, and the way to the other page. */
export function AudienceSwitch() {
  return (
    <span className="border-border text-muted-foreground hidden items-center rounded-full border p-0.5 text-xs sm:inline-flex">
      <span aria-current="page" className="bg-accent text-foreground rounded-full px-3 py-1">
        Developers
      </span>
      <Link href={`/${ENTERPRISE_PATH}`} onClick={() => rememberAudience('enterprise')} className="hover:text-foreground rounded-full px-3 py-1 transition-colors">
        Enterprise
      </Link>
    </span>
  );
}
