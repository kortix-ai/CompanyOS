'use client';

import { Button } from '@kortix/ui/button';
import { ChainOfThought } from '@kortix/ui/chain-of-thought';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@kortix/ui/dropdown-menu';
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@kortix/ui/disclosure';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { TextShimmer } from '@kortix/ui/text-shimmer';
import { cn } from '@kortix/ui';
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, CaretDownIcon, CaretRightIcon, PaperclipIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

import type { HeroRun } from './hero-runs';
import { AgentTile } from './section-art';

/** A horizontal trackpad swipe this long (px of `deltaX`) moves the reel one session. */
const SWIPE_PX = 40;
/** After a swipe moves the reel, the rest of that gesture's momentum is ignored for this long. */
const SWIPE_COOLDOWN_MS = 700;

/**
 * How long each beat of the playing session lasts: the message, the context,
 * the agent working, the answer, the result, then a hold before the reel moves on.
 */
const BEATS_MS = [700, 700, 1600, 700, 800, 3200];
const LAST_BEAT = BEATS_MS.length;

/** Panel width and the gap between panels. The track moves by their sum. */
const PANEL = 'min(84vw, 400px)';
/** The slide's length: `duration-slower` on the track. The reel settles after it. */
const SLIDE_MS = 500;
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
 * times and the track jumps back to the middle copy after each slide). It pauses on hover,
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
  // After the first arrow press the reader drives the reel: autoplay stops for good. Touch has
  // no hover and a tap does not focus, so this is the pause that works everywhere (WCAG 2.2.2).
  const [driven, setDriven] = useState(false);
  const active = ((pos % count) + count) % count;
  const run = runs[active]!;
  const caption = run.kind === 'example' ? `${run.caption} · example` : run.caption;
  const shownBeat = still ? LAST_BEAT : beat;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A sideways trackpad swipe moves the reel, as the arrows do. Vertical scrolling passes through
  // to the page. A native listener, because React's wheel handler is passive and cannot stop the
  // browser's back-swipe.
  const goRef = useRef<(step: number, manual?: boolean) => void>(() => {});
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let travel = 0;
    let lockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      travel += event.deltaX;
      if (Math.abs(travel) < SWIPE_PX) return;
      goRef.current(travel > 0 ? 1 : -1, true);
      travel = 0;
      lockedUntil = now + SWIPE_COOLDOWN_MS;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // The middle copy holds `pos` between moves. A move may step one panel outside it; the
  // reel then settles back before it accepts the next move, so `pos` never leaves the buffer.
  const outside = pos < count || pos >= 2 * count;
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  const go = useCallback(
    (step: number, manual = false) => {
      const current = posRef.current;
      // A press always takes control, even when its move is dropped below; the session it
      // shows is finished, because the reader chose it to read it.
      if (manual) {
        setDriven(true);
        setBeat(LAST_BEAT);
      }
      // Mid-settle: drop the move rather than push `pos` out of the buffer.
      if (!still && (current < count || current >= 2 * count)) return;
      if (!manual) setBeat(0);
      if (still) {
        // Reduced motion has no slide to wait for: land in the middle copy at once.
        setPos(count + ((((current + step) % count) + count) % count));
        return;
      }
      setAnimate(true);
      setPos(current + step);
    },
    [still, count],
  );
  useEffect(() => {
    goRef.current = go;
  }, [go]);

  // Play the active session one beat at a time, then move on.
  useEffect(() => {
    if (still || driven || hovered || focused || !visible) return;
    const id = setTimeout(() => (beat < LAST_BEAT ? setBeat(beat + 1) : go(1)), BEATS_MS[Math.min(beat, LAST_BEAT - 1)]);
    return () => clearTimeout(id);
  }, [beat, still, driven, hovered, focused, visible, go]);

  // After a slide ends outside the middle copy, jump back into it with no animation.
  // A timer, not `transitionend`: that event does not fire in a hidden tab.
  useEffect(() => {
    if (!outside) return;
    const id = setTimeout(() => {
      setAnimate(false);
      setPos(count + active);
    }, SLIDE_MS);
    return () => clearTimeout(id);
  }, [outside, count, active]);
  // Two frames: the first paints the jump with no transition, the second turns it back on.
  useEffect(() => {
    if (animate) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
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
            // Sessions already passed stay finished; the ones still to come show only their message.
            beat={index === pos ? shownBeat : still || index < pos ? LAST_BEAT : 0}
            still={still}
            instant={!animate || still}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-6">
        <p aria-hidden={still || driven} className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          <span key={run.id} className="animate-in fade-in duration-slow">
            {caption}
          </span>
        </p>
        {/* Announce only what the reader chose: a caption that changes on its own every few seconds is noise.
            The region is always mounted, so the first arrow press is announced too. */}
        <span aria-live="polite" className="sr-only">
          {still || driven ? caption : ''}
        </span>
        <div className="flex items-center gap-1">
          <ReelArrow label="Previous session" onClick={() => go(-1, true)}>
            <ArrowLeftIcon className="size-4" />
          </ReelArrow>
          <ReelArrow label="Next session" onClick={() => go(1, true)}>
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

/**
 * "Worked through N steps": the session chat's work fold. Closed, it is one
 * quiet line over the answer; open, a hairline under it, then the steps.
 */
function WorkFold({ run, working }: { run: HeroRun; working: boolean }) {
  if (working) {
    return (
      <TextShimmer className="text-sm [--base-color:color-mix(in_oklch,var(--muted-foreground)_55%,transparent)] [--base-gradient-color:var(--muted-foreground)] dark:[--base-color:color-mix(in_oklch,var(--muted-foreground)_55%,transparent)] dark:[--base-gradient-color:var(--muted-foreground)]">
        Working
      </TextShimmer>
    );
  }
  return (
    <Disclosure className="group/work flex-col">
      <DisclosureTrigger className="select-none">
        <div className="text-muted-foreground hover:text-foreground group-data-[state=open]/work:border-border flex w-full cursor-pointer items-center gap-2 text-left text-sm transition-colors group-data-[state=open]/work:border-b group-data-[state=open]/work:pb-2">
          <span className="min-w-0 truncate tabular-nums">Worked through {run.work.length} steps</span>
          <CaretRightIcon aria-hidden className="size-3.5 flex-none transition-transform group-data-[state=open]/work:rotate-90" />
        </div>
      </DisclosureTrigger>
      <DisclosureContent>
        <ChainOfThought className="mt-3 space-y-2">
          {run.work.map((step, index) => (
            <div key={index} className="flex items-baseline gap-2.5 text-sm">
              <span aria-hidden className="bg-muted-foreground/40 relative top-[-2px] size-1.5 shrink-0 rounded-full" />
              <span className={cn('min-w-0', step.cmd ? 'text-foreground font-mono text-xs' : 'text-muted-foreground')}>{step.cmd ? `$ ${step.text}` : step.text}</span>
            </div>
          ))}
        </ChainOfThought>
      </DisclosureContent>
    </Disclosure>
  );
}

/** One session window: its header, the conversation and a reply box. */
function SessionPanel({ run, playing, beat, still, instant }: { run: HeroRun; playing: boolean; beat: number; still: boolean; instant: boolean }) {
  const working = playing && !still && beat === 2;
  const agent = run.host.kind === 'claude-code' ? 'kortix' : run.host.slug;
  // What the reader typed into this window, with the reply each message got.
  const [sent, setSent] = useState<Array<{ message: string; to: string }>>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sent.length) end.current?.scrollIntoView({ block: 'nearest' });
  }, [sent.length]);
  return (
    <article
      style={{ width: PANEL }}
      className={cn(
        'bg-card flex h-[520px] shrink-0 flex-col overflow-hidden rounded-xl border',
        !instant && 'transition-[opacity,border-color] duration-slower ease-out',
        playing ? 'border-foreground/15 opacity-100' : 'border-border opacity-50',
      )}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {run.host.kind === 'claude-code' ? <Claude className="size-4 shrink-0" /> : <AgentTile slug={run.host.slug} />}
          <span className="text-foreground truncate text-sm font-medium">{run.host.kind === 'claude-code' ? 'Claude Code' : run.host.name}</span>
        </div>
        <span className="border-border text-muted-foreground shrink-0 truncate rounded-md border px-2 py-0.5 text-xs">{run.source}</span>
      </header>

      {/* The conversation scrolls on its own: an opened fold can be longer than the window. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pt-2 pb-2 [scrollbar-width:none]">
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

        <Beat instant={instant} at={2} beat={beat} className="flex flex-col gap-3">
          <WorkFold run={run} working={working} />
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

        {sent.map((item, index) => (
          <div key={index} className="flex flex-col gap-3">
            <p className="bg-muted text-foreground ml-8 self-end rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap">{item.message}</p>
            <p className="text-muted-foreground text-sm text-pretty">
              In your workspace, <span className="text-foreground">{item.to}</span> runs this on your repo. Copy the prompt above to set it up.
            </p>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="shrink-0 p-2.5">
        <LiveComposer defaultAgent={agent} busy={working} onSend={(message, to) => setSent((list) => [...list, { message, to }])} />
      </div>
    </article>
  );
}

/** The agents the picker offers: the factory and the teams a description can loop. */
const PICKER_AGENTS = ['factory', 'marketing', 'sales', 'support', 'recruiting'];

/**
 * The Kortix chat input, live: type into it, Enter sends (Shift+Enter is a new
 * line), the agent picker opens a menu, and send stays a secondary button.
 */
function LiveComposer({ defaultAgent, busy, onSend }: { defaultAgent: string; busy: boolean; onSend: (message: string, agent: string) => void }) {
  const [text, setText] = useState('');
  const [agent, setAgent] = useState(defaultAgent);
  const agents = PICKER_AGENTS.includes(agent) ? PICKER_AGENTS : [agent, ...PICKER_AGENTS];
  const send = () => {
    const message = text.trim();
    if (!message) return;
    onSend(message, agent);
    setText('');
  };
  return (
    <div className="border-border bg-card focus-within:border-foreground/20 flex flex-col gap-2 rounded-xl border p-2 transition-colors">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
        rows={2}
        aria-label={`Message ${agent}`}
        placeholder="Reply…"
        className="text-foreground placeholder:text-muted-foreground w-full resize-none bg-transparent px-1.5 pt-1 text-sm outline-none"
      />
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Attach a file" className="text-muted-foreground">
          <PaperclipIcon className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="xs" className="text-foreground gap-1.5 px-1.5 text-xs">
              <AgentTile slug={agent} />
              {agent}
              <CaretDownIcon className="text-muted-foreground size-3" />
            </Button>
          </DropdownMenuTrigger>
          {/* The menu renders in a portal outside the page's dark wrapper: it carries the dark theme itself. */}
          <DropdownMenuContent align="start" className="dark min-w-40">
            <DropdownMenuRadioGroup value={agent} onValueChange={setAgent}>
              {agents.map((slug) => (
                <DropdownMenuRadioItem key={slug} value={slug} className="gap-2">
                  <AgentTile slug={slug} />
                  {slug}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label={busy ? 'Working' : 'Send'}
          disabled={!busy && !text.trim()}
          onClick={send}
          className="ml-auto rounded-full"
        >
          {busy ? <span className="size-2 rounded-xs bg-current" /> : <ArrowUpIcon className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}
