'use client';

import { REFERENCE_REPOS, SETUP_PROMPT, loopPrompt } from '@kortix/shared/setup-guide';
import { cn } from '@kortix/ui';
import { useEffect, useRef, type ReactNode } from 'react';

import type { LoopView } from './loops-content';
import { Chips, CopyButton, Eyebrow, Window } from './parts';

/** The workspace every card sits in: one Kortix workspace is the company. Synthetic name. */
const WORKSPACE = 'your-company';
/** Where a stuck card's top sits below the 64 px header, and how far each next card steps down. */
const STICK_TOP = 88;
const STEP = 14;
/** How far a card shrinks and dims for each card stacked on it. */
const SHRINK = 0.04;
const DIM = 0.18;

/**
 * Stacked cards, one per factory. Each card sticks below the header; the next
 * one slides over it and the cards beneath shrink and dim, so the stack reads
 * as a deck. Below `lg` the cards are a plain list.
 */
export function FactoryStack({ loops, more }: { loops: LoopView[]; more: Array<{ name: string; line: string }> }) {
  const cards = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const stack = window.matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      const els = cards.current.filter((el): el is HTMLDivElement => el !== null);
      els.forEach((el, i) => {
        const inner = el.firstElementChild as HTMLElement | null;
        if (!inner) return;
        if (!stack.matches) {
          inner.style.transform = '';
          inner.style.filter = '';
          return;
        }
        // Depth: how many later cards cover this one, each counted 0..1 as it slides in.
        const height = el.getBoundingClientRect().height || 1;
        let depth = 0;
        for (const next of els.slice(i + 1)) {
          const top = next.getBoundingClientRect().top;
          const stuck = STICK_TOP + STEP * els.indexOf(next);
          depth += Math.min(1, Math.max(0, 1 - (top - stuck) / height));
        }
        inner.style.transform = `scale(${1 - SHRINK * depth})`;
        inner.style.filter = depth > 0 ? `brightness(${1 - DIM * Math.min(depth, 2)})` : '';
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    stack.addEventListener('change', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      stack.removeEventListener('change', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const total = loops.length + 1;
  const slot = (index: number, children: ReactNode, id: string) => (
    <div
      key={id}
      id={`loop-${id}`}
      ref={(el) => {
        cards.current[index] = el;
      }}
      className="scroll-mt-24 lg:sticky"
      style={{ top: STICK_TOP + STEP * index }}
    >
      <div className="border-border bg-card origin-top overflow-hidden rounded-xl border shadow-2xl shadow-black/50 will-change-transform">{children}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 px-4 pb-24 md:px-8 lg:gap-[18vh]">
      {loops.map((loop, index) => slot(index, <FactoryCard loop={loop} index={index} total={total} />, loop.id))}
      {slot(loops.length, <MoreCard more={more} index={loops.length} total={total} />, 'more')}
      {/* Sticky cards stop at their parent's content edge: this keeps the last card's stop in reach. */}
      <div aria-hidden className="hidden lg:block" />
    </div>
  );
}

function CardBar({ index, total, team }: { index: number; total: number; team: string }) {
  return (
    <div className="border-border text-muted-foreground flex items-center justify-between border-b px-6 py-3 font-mono text-xs">
      <span>
        {WORKSPACE} <span className="text-muted-foreground/50">/</span> <span className="text-foreground">{team.toLowerCase()}</span>
      </span>
      <span>
        {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  );
}

/** One factory: the template (what it runs) beside the one prompt that sets the same up on your codebase. */
function FactoryCard({ loop, index, total }: { loop: LoopView; index: number; total: number }) {
  const prompt = loopPrompt(loop);
  const reference = REFERENCE_REPOS[loop.id];
  return (
    <>
      <CardBar index={index} total={total} team={loop.team} />
      <div className="grid grid-cols-[minmax(0,1fr)] lg:min-h-[540px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="border-border flex flex-col gap-6 border-b p-6 md:p-8 lg:border-r lg:border-b-0">
          <div className="flex flex-col gap-3">
            <Eyebrow>{loop.team}</Eyebrow>
            <h3 className="text-foreground text-3xl font-medium tracking-tight lg:text-4xl">{loop.name}</h3>
            <p className="text-muted-foreground text-base text-pretty">{loop.line}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Chips items={loop.observes} />
            <span aria-hidden className="text-muted-foreground text-xs">↓</span>
            <Chips items={loop.ships} accent />
          </div>
          <div className="mt-auto flex flex-col gap-3">
            <span className="text-muted-foreground text-xs">One prompt · paste it into Claude Code or Codex in your repo</span>
            <pre className="border-border bg-background text-foreground/90 overflow-x-auto rounded-md border p-4 font-mono text-xs leading-5 whitespace-pre-wrap">{prompt}</pre>
            <div className="flex flex-wrap items-center gap-4">
              <CopyButton text={prompt} label={`Copy the ${loop.name} prompt`} />
              {reference ? (
                <a href={reference} className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline">
                  Reference repo
                </a>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 p-6 md:p-8">
          <TemplatePanel loop={loop} />
        </div>
      </div>
    </>
  );
}

/** The template as it lands in the repository: its agent, its triggers with their signals, its skills. */
function TemplatePanel({ loop }: { loop: LoopView }) {
  const hidden = loop.triggerCount - loop.triggers.length;
  return (
    <Window title={<span className="font-mono">{loop.folder}</span>} className="flex w-full flex-col">
      <div className="flex flex-1 flex-col gap-6 p-5 font-mono text-xs">
        <Row label={loop.agents.length === 1 ? 'agent' : 'agents'}>
          <span className="text-foreground">{loop.agents.join(', ')}</span>
          <span className="text-muted-foreground"> · runs 24/7 in its own sandbox</span>
        </Row>
        <Row label={loop.triggerTotal > loop.triggerCount ? `triggers · ${loop.triggerCount} on · ${loop.triggerTotal - loop.triggerCount} to switch on` : `triggers · ${loop.triggerCount}`}>
          <ul className="flex flex-col">
            {loop.triggers.map((trigger) => (
              <li key={trigger.name} className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
                <span className="text-foreground truncate">{trigger.name}</span>
                <span className="text-kortix-base shrink-0">{trigger.signal}</span>
              </li>
            ))}
            {hidden > 0 ? <li className="text-muted-foreground pt-2">+ {hidden} more</li> : null}
          </ul>
        </Row>
        <Row label={`skills · ${loop.skills.length}`}>
          <span className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            {loop.skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </span>
        </Row>
      </div>
    </Window>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground/70 text-[11px] tracking-wider uppercase">{label}</span>
      <div>{children}</div>
    </div>
  );
}

/** The last card: every other team, built from a description by the same prompt. */
function MoreCard({ more, index, total }: { more: Array<{ name: string; line: string }>; index: number; total: number }) {
  return (
    <>
      <CardBar index={index} total={total} team="& more" />
      <div className="grid grid-cols-[minmax(0,1fr)] lg:min-h-[540px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="border-border flex flex-col gap-6 border-b p-6 md:p-8 lg:border-r lg:border-b-0">
          <div className="flex flex-col gap-3">
            <Eyebrow>Every other team</Eyebrow>
            <h3 className="text-foreground text-3xl font-medium tracking-tight lg:text-4xl">Describe it. Same prompt.</h3>
            <p className="text-muted-foreground text-base text-pretty">
              No template needed. Your agent writes the agents, triggers and skills from your description, in the same workspace.
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-3">
            <pre className="border-border bg-background text-foreground/90 overflow-x-auto rounded-md border p-4 font-mono text-xs leading-5 whitespace-pre-wrap">{SETUP_PROMPT}</pre>
            <div>
              <CopyButton />
            </div>
          </div>
        </div>
        <ul className="grid content-start sm:grid-cols-2">
          {more.map((entry, i) => (
            <li key={entry.name} className={cn('border-border flex flex-col gap-1.5 border-b p-6', i % 2 === 0 && 'sm:border-r')}>
              <span className="text-foreground text-sm font-medium">{entry.name}</span>
              <span className="text-muted-foreground text-sm">{entry.line}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
