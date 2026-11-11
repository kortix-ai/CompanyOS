'use client';

import { KortixLogo } from '@/components/sidebar/kortix-logo';
import { DitherField } from '@/features/marketing/kit/dither-field';
import { setupPromptFor } from '@kortix/shared/setup-guide';
import { cn } from '@kortix/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Kbd } from '@kortix/ui/kbd';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { AUDIENCE_BOOT, AUDIENCE_KEY, ENTERPRISE_PATH, decide, rememberAudience, type Audience } from './audience';
import { useSetupTarget } from './parts';

/** How long the chosen half takes to fill the screen before the page behind it shows. */
const LEAVE_MS = 500;

const noSubscription = () => () => {};

/** What the prompt does, in the order the setup guide does it. */
const STEPS = ['Signed in, repository scanned', 'kortix.yaml written, secrets set', 'Sandbox built, triggers live', 'First pull request opened'];

/** One line per team: the signal, then what the agents ship. */
const TEAMS: Array<[team: string, work: string]> = [
  ['Engineering', 'issues → pull requests'],
  ['Marketing', 'merges → changelog, posts'],
  ['Sales', 'signups → researched leads'],
  ['Support', 'tickets → drafted replies'],
  ['Operations', 'reports, on schedule'],
];

/** Each row lights up one step after the one above it while its half is active. */
const ROW_DELAY = ['delay-0', 'delay-100', 'delay-200', 'delay-300', 'delay-500'];

const HALF =
  'group relative flex min-h-0 min-w-0 cursor-pointer flex-col justify-between gap-8 overflow-hidden p-8 text-left outline-none transition-[flex,opacity] duration-slow ease-out motion-reduce:transition-none md:p-12 lg:p-16';
const HEADLINE = 'text-4xl leading-none font-medium tracking-tight sm:text-5xl lg:text-6xl';
const LINE = 'text-muted-foreground max-w-md text-base text-pretty lg:text-lg';
/** A row that is muted at rest and takes the foreground color while its half is hovered or focused. */
const LIT = 'transition-colors duration-slow group-hover:text-foreground group-focus-visible:text-foreground motion-reduce:transition-none';

function Enter({ children }: { children: ReactNode }) {
  return (
    <span className="text-foreground flex items-center gap-2 text-sm font-medium">
      {children}
      <span aria-hidden className="transition-transform duration-moderate group-hover:translate-x-1 group-focus-visible:translate-x-1 motion-reduce:transition-none">→</span>
    </span>
  );
}

/**
 * The first screen of kortix.com for a new visitor: two halves, one question.
 * "Developer" opens the one-prompt page that is already rendered behind the
 * gate; "Enterprise" goes to the CompanyOS page. The choice is remembered, and
 * the header of each page switches it. The page behind is in the HTML, so a
 * crawler and a browser without JavaScript read the developer page.
 *
 * Keys: ← and → move between the halves, Enter opens one, D and E open one
 * directly, Esc opens the developer page. Tab stays inside the gate.
 */
export function AudienceGate() {
  const router = useRouter();
  const prompt = setupPromptFor(useSetupTarget());
  const [hover, setHover] = useState<Audience | null>(null);
  const [leaving, setLeaving] = useState<Audience | null>(null);
  const [closed, setClosed] = useState(false);
  const gate = useRef<HTMLDivElement | null>(null);
  const developer = useRef<HTMLButtonElement | null>(null);
  const enterprise = useRef<HTMLButtonElement | null>(null);
  const reducedMotion = useSyncExternalStore(
    noSubscription,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  // An inline script does not run on a client-side navigation: decide again on mount.
  useLayoutEffect(() => {
    decide(AUDIENCE_KEY, ENTERPRISE_PATH);
  }, []);

  const enterprisePath = () => `${window.location.pathname.replace(/\/$/, '')}/${ENTERPRISE_PATH}`;

  const choose = (audience: Audience) => {
    if (leaving) return;
    rememberAudience(audience);
    setLeaving(audience);
    const done = () => {
      if (audience === 'enterprise') {
        router.push(enterprisePath());
        return;
      }
      document.documentElement.dataset.audience = audience;
      setClosed(true);
    };
    if (reducedMotion) done();
    else window.setTimeout(done, LEAVE_MS);
  };
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });

  // While the gate covers the page: no scroll behind it, and the keyboard belongs to it.
  useEffect(() => {
    const root = document.documentElement;
    if (closed || root.dataset.audience) return;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'arrowup') developer.current?.focus();
      else if (key === 'arrowright' || key === 'arrowdown') enterprise.current?.focus();
      else if (key === 'd' || key === 'escape') chooseRef.current('developer');
      else if (key === 'e') chooseRef.current('enterprise');
      else if (key === 'tab') {
        // Keep Tab inside the gate: the page behind it is not reachable yet.
        const stops = [...(gate.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])];
        const at = stops.indexOf(document.activeElement as HTMLElement);
        stops[(at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener('keydown', onKey);
    };
  }, [closed]);

  const grow = (side: Audience) =>
    leaving ? (leaving === side ? 'flex-[1_1_100%]' : 'flex-[0_0_0%] opacity-0') : hover === side ? 'flex-[1.25_1_0%]' : hover ? 'flex-[0.85_1_0%]' : 'flex-[1_1_0%]';
  const side = (audience: Audience) => ({
    type: 'button' as const,
    onClick: () => choose(audience),
    onMouseEnter: () => setHover(audience),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(audience),
    onBlur: () => setHover(null),
  });

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
          ref={gate}
          role="dialog"
          aria-modal="true"
          aria-label="Choose your Kortix: developer or enterprise"
          className={cn(
            'fixed inset-0 z-50 flex flex-col md:flex-row [html[data-audience]_&]:hidden',
            leaving === 'developer' && 'animate-out fade-out fill-mode-forwards delay-300 duration-moderate motion-reduce:animate-none',
          )}
        >
          <button
            ref={developer}
            {...side('developer')}
            className={cn('dark bg-background text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset', HALF, grow('developer'))}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 transition-opacity duration-slow [mask-image:linear-gradient(to_bottom,transparent_20%,#000)] group-hover:opacity-100 group-focus-visible:opacity-100">
              <DitherField className="text-kortix-base" />
            </div>
            <span className="relative flex items-center gap-3">
              <KortixLogo size={16} variant="logomark" />
              <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">For developers</span>
            </span>
            <span className="relative hidden max-w-md flex-col gap-4 lg:flex">
              <span className="border-border bg-card text-foreground rounded-lg border p-4 font-mono text-xs leading-5 whitespace-pre-wrap">{prompt}</span>
              <span className="text-muted-foreground flex flex-col gap-1.5 pl-1 font-mono text-xs">
                {STEPS.map((step, i) => (
                  <span key={step} className={cn('flex items-center gap-2', LIT, ROW_DELAY[i])}>
                    <span aria-hidden className="text-kortix-base">✓</span>
                    {step}
                  </span>
                ))}
              </span>
            </span>
            <span className="relative flex flex-col gap-6">
              <span className={HEADLINE}>One prompt.</span>
              <span className={LINE}>Agents on your repo, 24/7. Set up by the coding agent you already use.</span>
              <Enter>Build with Kortix</Enter>
            </span>
          </button>

          <button
            ref={enterprise}
            data-theme-preview="pure-light"
            {...side('enterprise')}
            onPointerEnter={() => router.prefetch(enterprisePath())}
            className={cn('bg-background text-foreground border-border focus-visible:ring-ring border-t focus-visible:ring-2 focus-visible:ring-inset md:border-t-0 md:border-l', HALF, grow('enterprise'))}
          >
            <span className="text-muted-foreground relative font-mono text-xs tracking-wider uppercase">For enterprises</span>
            <span className="border-border bg-card relative hidden max-w-md flex-col rounded-lg border lg:flex">
              {TEAMS.map(([team, work], i) => (
                <span key={team} className="border-border flex items-center justify-between gap-4 border-b px-4 py-2 text-sm last:border-b-0">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="bg-kortix-base size-1.5 rounded-full" />
                    {team}
                  </span>
                  <span className={cn('text-muted-foreground truncate font-mono text-xs', LIT, ROW_DELAY[i])}>{work}</span>
                </span>
              ))}
            </span>
            <span className="relative flex flex-col gap-6">
              <span className={HEADLINE}>The CompanyOS.</span>
              <span className={LINE}>Agents for every team, on your tools and context. Open source, in our cloud or yours.</span>
              <Enter>Run your company on Kortix</Enter>
            </span>
          </button>

          {/* Someone with an account is not choosing an audience: the way in stays visible. */}
          <Link
            href="/auth"
            data-theme-preview="pure-light"
            className="border-border bg-background text-foreground hover:bg-accent focus-visible:ring-ring absolute top-6 right-8 inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 md:top-10 md:right-12 lg:top-14 lg:right-16"
          >
            Sign in
          </Link>

          {/* Bottom right: both calls to action sit on the left of their half. */}
          <span aria-hidden data-theme-preview="pure-light" className="text-muted-foreground pointer-events-none absolute right-8 bottom-6 hidden items-center gap-3 text-xs whitespace-nowrap md:right-12 md:bottom-10 lg:right-16 lg:bottom-14 lg:flex">
            <span className="flex items-center gap-1">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
              choose
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="w-auto">Enter</Kbd>
              open
            </span>
            <span>Your choice is remembered</span>
          </span>
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
