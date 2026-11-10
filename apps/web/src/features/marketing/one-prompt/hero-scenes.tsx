'use client';

import { cn } from '@kortix/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { DEMO } from './factory-content';

const SCENE_MS = 8000;
const STEP_MS = 650;

interface Scene {
  id: string;
  label: string;
  /** `real`: every line happened (the demo run). `example`: the steps the loop runs, with example inputs. */
  kind: 'real' | 'example';
  source: string;
  signal: { title: string; meta: string };
  steps: Array<{ text: string; done?: boolean }>;
  ship: { kind: string; title: string; lines: string[]; status: string };
}

const SCENES: Scene[] = [
  {
    id: 'engineering',
    label: 'Engineering',
    kind: 'real',
    source: `GitHub Issues · ${DEMO.repo}`,
    signal: { title: DEMO.tickets[0]!.title, meta: `issue #${DEMO.tickets[0]!.number} · filed by the nightly tests` },
    steps: DEMO.worker.map((line) => ({ text: line.kind === 'cmd' ? `$ ${line.text}` : line.text, done: line.kind === 'ok' })),
    ship: { kind: `pull request #${DEMO.pr.number}`, title: DEMO.pr.title, lines: DEMO.pr.checks, status: 'Waiting for a person to merge.' },
  },
  {
    id: 'marketing',
    label: 'Marketing',
    kind: 'example',
    source: 'GitHub · merged pull requests',
    signal: { title: 'Merged: return 400 on malformed JSON', meta: 'push to main' },
    steps: [
      { text: 'load the brand skill: voice, colors, type' },
      { text: 'write the changelog entry' },
      { text: 'draft the blog post in the site’s format' },
      { text: 'record the change in the sandbox browser' },
      { text: 'render a captioned video with HyperFrames', done: true },
    ],
    ship: { kind: 'pull request', title: 'docs(changelog): malformed JSON now returns 400', lines: ['changelog entry', 'blog post draft', 'video · captioned, on brand', 'social drafts'], status: 'Waiting for a person to publish.' },
  },
];

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * The hero: one short clip per loop. The signal arrives, the agent's steps
 * appear one by one, the result lands. Auto-advances every 8 s; a tab click
 * jumps; hover pauses; reduced motion shows the whole scene at once.
 */
export function HeroScenes() {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const still = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);

  useEffect(() => {
    if (paused || still) return;
    const started = performance.now() - elapsed;
    const id = setInterval(() => {
      const t = performance.now() - started;
      if (t >= SCENE_MS) {
        setIndex((i) => (i + 1) % SCENES.length);
        setElapsed(0);
      } else setElapsed(t);
    }, 100);
    return () => clearInterval(id);
    // `elapsed` seeds the clock when play resumes; it must not restart the interval each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, still, index]);

  const scene = SCENES[index]!;
  const shown = still ? scene.steps.length : Math.min(scene.steps.length, Math.floor(elapsed / STEP_MS));
  const landed = still || shown >= scene.steps.length;
  const select = (i: number) => {
    setIndex(i);
    setElapsed(0);
  };

  return (
    <div
      className="border-border bg-background overflow-hidden rounded-lg border shadow-2xl shadow-black/40"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div role="tablist" aria-label="Loops" className="border-border grid grid-cols-2 border-b">
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={i === index}
            onClick={() => select(i)}
            className={cn('border-border relative border-r px-3 py-3 text-left text-sm transition-colors last:border-r-0', i === index ? 'text-foreground bg-card' : 'text-muted-foreground hover:text-foreground')}
          >
            {s.label}
            <span aria-hidden className="bg-border absolute inset-x-0 bottom-0 h-0.5">
              <span
                className="bg-kortix-base block h-full"
                style={{ width: i === index ? `${still ? 100 : Math.min(100, (elapsed / SCENE_MS) * 100)}%` : i < index ? '100%' : '0%', opacity: i < index ? 0.35 : 1 }}
              />
            </span>
          </button>
        ))}
      </div>

      <div key={scene.id} className="animate-in fade-in grid min-h-[380px] duration-300 lg:grid-cols-[1fr_1.2fr_1fr]">
        <div className="border-border flex flex-col gap-3 border-b p-5 lg:border-r lg:border-b-0">
          <span className="text-muted-foreground text-xs">Watches · {scene.source}</span>
          <div className="border-border bg-card animate-in fade-in slide-in-from-left-2 flex flex-col gap-1.5 rounded-md border p-4 duration-500">
            <span className="text-foreground text-sm">{scene.signal.title}</span>
            <span className="text-muted-foreground text-xs">{scene.signal.meta}</span>
          </div>
          <span className={cn('mt-auto self-start rounded-full px-2 py-0.5 font-mono text-[11px]', scene.kind === 'real' ? 'bg-kortix-base/15 text-kortix-base' : 'bg-accent text-muted-foreground')}>
            {scene.kind === 'real' ? 'a real run' : 'how it runs'}
          </span>
        </div>

        <div className="border-border flex flex-col gap-3 border-b p-5 lg:border-r lg:border-b-0">
          <span className="text-muted-foreground text-xs">Agent · {scene.label.toLowerCase()} loop</span>
          <ol className="flex flex-col gap-2.5 font-mono text-xs leading-5">
            {scene.steps.map((step, i) => (
              <li
                key={step.text}
                className={cn('transition-opacity duration-300', i < shown ? 'opacity-100' : 'opacity-0', step.done ? 'text-kortix-base' : 'text-foreground')}
              >
                {step.text}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <span className="text-muted-foreground text-xs">Ships · {scene.ship.kind}</span>
          <div className={cn('border-border flex flex-col gap-3 rounded-md border p-4 transition-all duration-500', landed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}>
            <span className="text-foreground text-sm font-medium">{scene.ship.title}</span>
            <ul className="text-muted-foreground flex flex-col gap-1.5 font-mono text-xs">
              {scene.ship.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <span className={cn('text-muted-foreground text-xs transition-opacity duration-500', landed ? 'opacity-100' : 'opacity-0')}>{scene.ship.status}</span>
        </div>
      </div>
    </div>
  );
}
