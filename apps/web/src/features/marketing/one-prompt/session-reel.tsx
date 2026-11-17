'use client';

import { Close } from '@kortix/ui/icons';
import { AgentMark } from '@kortix/ui/internal/components/agent-mark';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { cn } from '@kortix/ui';
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, ArrowsOutSimpleIcon, CaretDownIcon, CaretRightIcon, MinusIcon, PaperclipIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

import type { HeroRun } from './hero-runs';

/**
 * How long each beat of the playing session lasts: the message, the context,
 * the agent working, the answer, the result, then a hold before the reel moves on.
 */
const BEATS_MS = [700, 700, 1600, 700, 800, 3200];
const LAST_BEAT = BEATS_MS.length;

/** Panel width and the gap between panels. The track moves by their sum. */
const PANEL = 'min(84vw, 400px)';
const GAP = '16px';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * The hero reel: agent sessions side by side. The session at the left edge
 * plays: its message arrives, the agent works, the result lands. Then the
 * reel moves one panel on. It loops without end (the list is drawn three
 * times and the track jumps back to the middle copy). It pauses on hover,
 * on focus and off screen. Reduced motion shows every session finished and
 * moves only when the arrows are used.
 */
export function SessionReel({ runs }: { runs: HeroRun[] }) {
  const count = runs.length;
  const root = useRef<HTMLDivElement>(null);
  const still = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  // `pos` indexes the tripled list; the middle copy starts at `count`.
  const [pos, setPos] = useState(count);
  const [animate, setAnimate] = useState(true);
  const [beat, setBeat] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const active = ((pos % count) + count) % count;
  const run = runs[active]!;
  const shownBeat = still ? LAST_BEAT : beat;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const go = useCallback(
    (step: number) => {
      setBeat(0);
      // Reduced motion has no slide to wait for: land in the middle copy at once.
      if (still) return setPos((current) => count + ((((current + step) % count) + count) % count));
      setAnimate(true);
      setPos((current) => current + step);
    },
    [still, count],
  );

  // Play the active session one beat at a time, then move on.
  useEffect(() => {
    if (still || hovered || focused || !visible) return;
    const id = setTimeout(() => (beat < LAST_BEAT ? setBeat(beat + 1) : go(1)), BEATS_MS[Math.min(beat, LAST_BEAT - 1)]);
    return () => clearTimeout(id);
  }, [beat, still, hovered, focused, visible, go]);

  // After a slide ends outside the middle copy, jump back into it with no animation.
  const settle = () => {
    if (pos >= count && pos < 2 * count) return;
    setAnimate(false);
    setPos(count + active);
  };
  useEffect(() => {
    if (animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  const panels = [...runs, ...runs, ...runs];
  const track: CSSProperties = {
    gap: GAP,
    transform: `translate3d(calc(-${pos} * (${PANEL} + ${GAP})), 0, 0)`,
  };

  return (
    <div
      ref={root}
      role="region"
      aria-roledescription="carousel"
      aria-label="Agent sessions"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      // Focus moving between the two arrows stays inside: only leaving the reel resumes it.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className="flex flex-col gap-8"
    >
      <div
        style={track}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget) settle();
        }}
        className={cn(
          'flex',
          // A large element crossing the page: the marketing duration, the house curve.
          animate && !still && 'ease-default transition-transform duration-slower',
        )}
      >
        {panels.map((item, index) => (
          <SessionPanel
            key={`${item.id}-${index}`}
            run={item}
            playing={index === pos}
            // Sessions already passed stay finished; the ones still to come wait for their message.
            beat={index === pos ? shownBeat : still || index < pos ? LAST_BEAT : 0}
            still={still}
            instant={!animate || still}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-6">
        <p aria-live="polite" className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          <span key={run.id} className="animate-in fade-in duration-slow">
            {run.caption}
          </span>
        </p>
        <div className="flex items-center gap-1">
          <ReelArrow label="Previous session" onClick={() => go(-1)}>
            <ArrowLeftIcon className="size-4" />
          </ReelArrow>
          <ReelArrow label="Next session" onClick={() => go(1)}>
            <ArrowRightIcon className="size-4" />
          </ReelArrow>
        </div>
      </div>
    </div>
  );
}

function ReelArrow({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-9 items-center justify-center rounded-md transition-colors"
    >
      {children}
    </button>
  );
}

/** A beat's content: mounted from the first frame, faded in when its beat arrives, so the panel never jumps. */
function Beat({ at, beat, instant, className, children }: { at: number; beat: number; instant: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div aria-hidden={beat < at} className={cn(!instant && 'transition-opacity duration-slower ease-out', beat >= at ? 'opacity-100' : 'opacity-0', className)}>
      {children}
    </div>
  );
}

/** One session window: its header, the conversation and a reply box. */
function SessionPanel({ run, playing, beat, still, instant }: { run: HeroRun; playing: boolean; beat: number; still: boolean; instant: boolean }) {
  const working = playing && !still && beat === 2;
  return (
    <article
      aria-hidden={!playing}
      style={{ width: PANEL }}
      className={cn(
        'bg-card flex h-[520px] shrink-0 flex-col overflow-hidden rounded-xl border',
        !instant && 'transition-[opacity,border-color] duration-slower ease-out',
        playing ? 'border-foreground/15 opacity-100' : 'border-border opacity-50',
      )}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {run.host.kind === 'claude-code' ? <Claude className="size-4 shrink-0" /> : <AgentMark slug={run.host.slug} size={14} />}
          <span className="text-foreground truncate text-sm font-medium">{run.host.kind === 'claude-code' ? 'Claude Code' : run.host.name}</span>
          <span className="border-border text-muted-foreground shrink-0 truncate rounded-sm border px-1.5 text-xs">{run.source}</span>
        </div>
        <div aria-hidden className="text-muted-foreground flex shrink-0 items-center gap-2.5">
          <MinusIcon className="size-3.5" />
          <ArrowsOutSimpleIcon className="size-3.5" />
          <Close className="size-3.5" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pt-2">
        <div className="flex flex-col items-end gap-2">
          <p className="bg-muted text-foreground ml-8 rounded-lg px-3 py-2.5 text-sm">
            {/* The clamp sits on the text, not the padded bubble, so no half line shows below it. */}
            <span className="line-clamp-3 whitespace-pre-line">{run.ask}</span>
          </p>
          {run.context ? (
            <Beat instant={instant} at={1} beat={beat}>
              <span className="text-muted-foreground text-xs">
                <span className="text-foreground">{run.context}</span> added to context
              </span>
            </Beat>
          ) : null}
        </div>

        <Beat instant={instant} at={2} beat={beat} className="flex flex-col gap-2">
          <span className={cn('text-muted-foreground inline-flex items-center gap-1 text-xs', working && 'animate-pulse')}>
            {working ? 'Working' : `Worked through ${run.steps} steps`}
            <CaretRightIcon weight="fill" className="size-2.5" />
          </span>
          <Beat instant={instant} at={3} beat={beat}>
            <p className="text-foreground text-sm text-pretty">{run.answer}</p>
          </Beat>
        </Beat>

        {run.rows ? (
          <Beat instant={instant} at={4} beat={beat}>
            <ul className="border-border divide-border divide-y rounded-lg border">
              {run.rows.map((row) => (
                <li key={row.label + row.text} className="flex items-baseline gap-3 px-3 py-2 text-xs">
                  <span className={cn('shrink-0 font-mono', row.done ? 'text-foreground' : 'text-muted-foreground')}>{row.label}</span>
                  <span className="text-muted-foreground truncate">{row.text}</span>
                </li>
              ))}
            </ul>
          </Beat>
        ) : null}

        {run.result ? (
          <Beat instant={instant} at={4} beat={beat}>
            <div className="border-border flex flex-col gap-1 rounded-lg border px-3 py-2.5">
              <span className="text-muted-foreground font-mono text-xs">{run.result.kind}</span>
              <span className="text-foreground line-clamp-2 text-sm font-medium">{run.result.title}</span>
              <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                <span aria-hidden className="bg-kortix-base size-1.5 rounded-full" />
                {run.result.status}
              </span>
            </div>
          </Beat>
        ) : null}
      </div>

      <div aria-hidden className="p-2.5">
        <div className="bg-muted/60 flex flex-col gap-4 rounded-lg px-3 pt-3 pb-2.5">
          <span className="text-muted-foreground text-sm">Reply…</span>
          <div className="text-muted-foreground flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-xs">
              Skills
              <CaretDownIcon className="size-3" />
            </span>
            <div className="flex items-center gap-2.5">
              <PaperclipIcon className="size-3.5" />
              <span className={cn('inline-flex size-6 items-center justify-center rounded-full', working ? 'bg-foreground text-background' : 'bg-accent text-muted-foreground')}>
                {working ? <span className="size-2 rounded-xs bg-current" /> : <ArrowUpIcon className="size-3" />}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
