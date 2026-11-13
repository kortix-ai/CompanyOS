'use client';

import { Button } from '@kortix/ui/button';
import { Combobox } from '@kortix/ui/combobox';
import { Tabs, TabsList, TabsTrigger } from '@kortix/ui/tabs';
import { cn } from '@kortix/ui';
import { PlayIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

/**
 * Motion, shown rather than described. Every demo runs on the real tokens
 * (`duration-*`, `ease-*`), and the numbers beside it are read live from the
 * page's CSS variables. The rules are motion.md; this page is their proof.
 */

const DURATIONS = [
  ['fast', 'duration-fast', 'Hover color and opacity'],
  ['normal', 'duration-normal', 'The default UI transition'], // audit:allow a data row naming the token
  ['moderate', 'duration-moderate', 'Tab switch, disclosure, combobox'],
  ['slow', 'duration-slow', 'Modal, sheet, drawer: the product ceiling'],
  ['slower', 'duration-slower', 'Marketing and decks only'], // audit:allow a data row naming the token
] as const;

const EASINGS = [
  ['out', 'ease-out', 'Enter and exit. Reach here first.'],
  ['in-out', 'ease-in-out', 'Something already on screen moves or morphs'],
  ['default', 'ease-default', 'The Kortix house curve'],
] as const;

const LADDER = [
  ['Constantly', 'tens of times an hour', 'None', 'Keyboard navigation, row hover in a dense list, every menu, select, popover, tooltip, the command palette'],
  ['Often', 'several times a session', '100 to 200ms', 'Hover on a large target, tab switch, disclosure, a combobox opened by pointer'],
  ['Occasionally', 'once or twice a session', '200 to 300ms', 'Modal, sheet, drawer, toast, hover card'],
  ['Rarely', 'first run, a moment worth marking', '300ms or less', 'Empty to first content, a finished deploy'],
  ['Marketing', 'one viewing', 'up to 500ms', 'One hero moment per viewport'],
] as const;

function useCssVar(name: string) {
  const [value, setValue] = useState('');
  useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  }, [name]);
  return value;
}

/** A dot that crosses a track when played: the duration or the curve, felt. */
function Track({ durationClass, easeClass, play }: { durationClass: string; easeClass: string; play: boolean }) {
  return (
    // The runner is the track minus one dot wide; translate-x-full moves it by
    // its own width, so the dot lands on the far end. Transform, never `left`.
    <div className="bg-secondary relative h-2 w-full rounded-full">
      <span aria-hidden className="absolute inset-y-0 start-0 end-3">
        <span
          className={cn(
            'block size-full transition-transform motion-reduce:transition-none',
            durationClass,
            easeClass,
            play && 'translate-x-full',
          )}
        >
          <span className="bg-foreground absolute top-1/2 left-0 size-3 -translate-y-1/2 rounded-full" />
        </span>
      </span>
    </div>
  );
}

function DurationRow({ token, utility, use, play }: { token: string; utility: string; use: string; play: boolean }) {
  const ms = useCssVar(`--duration-${token}`);
  return (
    <div className="border-border grid grid-cols-[9rem_1fr] items-center gap-4 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_14rem_1fr]">
      <div className="flex flex-col">
        <span className="font-mono text-xs">{utility}</span>
        <span className="text-muted-foreground font-mono text-xs">{ms}</span>
      </div>
      <span className="text-muted-foreground hidden text-xs sm:block">{use}</span>
      <Track durationClass={utility} easeClass="ease-out" play={play} />
    </div>
  );
}

function EaseRow({ token, utility, use, play }: { token: string; utility: string; use: string; play: boolean }) {
  const curve = useCssVar(`--ease-${token}`);
  return (
    <div className="border-border grid grid-cols-[9rem_1fr] items-center gap-4 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_14rem_1fr]">
      <div className="flex min-w-0 flex-col">
        <span className="font-mono text-xs">{utility}</span>
        <span className="text-muted-foreground truncate font-mono text-xs">{curve}</span>
      </div>
      <span className="text-muted-foreground hidden text-xs sm:block">{use}</span>
      <Track durationClass="duration-slower" easeClass={utility} play={play} /* audit:allow 500ms so the curve is visible */ />
    </div>
  );
}

function PlayButton({ play, onToggle }: { play: boolean; onToggle: () => void }) {
  return (
    <div className="border-border flex justify-end border-b px-4 py-2">
      <Button size="sm" variant="secondary" onClick={onToggle}>
        <PlayIcon aria-hidden />
        {play ? 'Play back' : 'Play'}
      </Button>
    </div>
  );
}

export default function MotionPage() {
  const [durPlay, setDurPlay] = useState(false);
  const [easePlay, setEasePlay] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <DocPage
      title="Motion"
      lead="Fast, or none. Motion exists to show where a thing came from or what changed, never to decorate. Count how often a person sees an animation before you give it any time: the fiftieth viewing is the design target, not the first."
    >
      <DocSection title="Frequency sets the budget" description="Pick the row first. The row decides the duration, not taste.">
        <div tabIndex={0} role="region" aria-label="Motion budget by frequency" className="border-border overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr className="border-border border-b">
                {['Seen', 'Budget', 'Examples'].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LADDER.map(([seen, how, budget, examples]) => (
                <tr key={seen} className="border-border border-b align-top last:border-b-0">
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{seen}</span>
                    <span className="text-muted-foreground block text-xs">{how}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{budget}</td>
                  <td className="text-muted-foreground px-3 py-2.5 text-xs">{examples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Duration" description="Write the token, never the number. 300ms is the ceiling for anything in the product.">
        <Example
          previewClassName="flex-col items-stretch gap-0 p-0"
          code={`<div className="transition-colors duration-fast ease-out hover:bg-hover" />
<Tabs /> {/* duration-moderate: 200ms */}
<Sheet /> {/* duration-slow: 300ms, the ceiling */}`}
        >
          <PlayButton play={durPlay} onToggle={() => setDurPlay((p) => !p)} />
          {DURATIONS.map(([token, utility, use]) => (
            <DurationRow key={token} token={token} utility={utility} use={use} play={durPlay} />
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Easing"
        description="ease-out for anything that enters or leaves: it moves first and settles, so it feels immediate. Never ease-in on UI: it starts slow and reads as lag. Each dot below runs 500ms so the curve is visible." /* audit:allow prose names the banned curve */
      >
        <Example
          previewClassName="flex-col items-stretch gap-0 p-0"
          code={`className="transition-[opacity,scale] duration-moderate ease-out"`}
        >
          <PlayButton play={easePlay} onToggle={() => setEasePlay((p) => !p)} />
          {EASINGS.map(([token, utility, use]) => (
            <EaseRow key={token} token={token} utility={utility} use={use} play={easePlay} />
          ))}
        </Example>
      </DocSection>

      <DocSection title="Press" description="A button scales to 96% while pressed, in 150ms. A full-width row scales to 99.8%. A form field never scales.">
        <Example code={`// Built into Button: enabled:active:scale-[0.96]\n<Button>Press and hold</Button>`}>
          <Button>Press and hold</Button>
          <Button variant="secondary" size="lg">
            Press and hold
          </Button>
        </Example>
      </DocSection>

      <DocSection title="Tab switch" description="The chip or the bar slides to the new tab in 200ms ease-out. Arrow keys move focus instantly; only the indicator travels.">
        <Example code={`<TabsList>…</TabsList>\n<TabsList type="underline" animate="fluid">…</TabsList>`}>
          {(['default', 'underline'] as const).map((type) => (
            <Tabs key={type} defaultValue="one">
              <TabsList type={type === 'underline' ? 'underline' : undefined} animate="fluid">
                <TabsTrigger value="one">Overview</TabsTrigger>
                <TabsTrigger value="two">Activity</TabsTrigger>
                <TabsTrigger value="three">Settings</TabsTrigger>
              </TabsList>
            </Tabs>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Popup from its trigger"
        description="Every floating panel opens the same way: from its trigger, scale 0.95 to 1 and a fade, in 200ms ease-in-out, reversed on close. Menus, popovers, the combobox, tooltips and dialogs share it. The select starts at 0.97, because its list sits on the trigger. A tooltip adds a 4px nudge from its side."
      >
        <Example
          code={`// FLOATING_PANEL_MOTION in @kortix/ui menu-recipe.ts
origin-(--transform-origin) transition-[opacity,scale,translate] duration-moderate ease-in-out
data-starting-style:scale-95 data-starting-style:opacity-0
data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none`}
        >
          <Combobox
            options={['Asia/Tokyo', 'Europe/Prague', 'Europe/London'].map((z) => ({ value: z, label: z }))}
            defaultValue="Europe/Prague"
            aria-label="Timezone"
            className="w-56"
          />
        </Example>
      </DocSection>

      <DocSection title="Disclosure" description="A caret rotates 90° in 200ms; the content appears with it. Height is never animated with a fixed number.">
        <Example code={`<CaretRightIcon className={cn('transition-transform duration-moderate ease-out', open && 'rotate-90')} />`}>
          <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <PlayIcon aria-hidden className={cn('transition-transform duration-moderate ease-out motion-reduce:transition-none', open && 'rotate-90')} />
            {open ? 'Hide details' : 'Show details'}
          </Button>
          {open && <p className="text-muted-foreground w-full text-sm">The details sit here.</p>}
        </Example>
      </DocSection>

      <DocSection title="Reduced motion" description="When the system asks for reduced motion, every transition on this page drops to none. Movement is never the only signal: the state change is still visible." /* audit:allow prose */>
        <Example code={`className="transition-transform duration-moderate ease-out motion-reduce:transition-none"`}>
          <p className="text-muted-foreground text-sm">
            Turn on Reduce motion in your system settings, then replay the demos above.
          </p>
        </Example>
      </DocSection>
    </DocPage>
  );
}
