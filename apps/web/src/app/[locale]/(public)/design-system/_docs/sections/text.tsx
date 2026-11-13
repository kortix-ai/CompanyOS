'use client';

import { DocPage, DocSection, Example } from '../doc';
import { SPECIMEN_PREVIEW, Specimen, specimenCode } from './specimen';

const SAMPLE =
  'Kortix runs each session in its own sandbox. The agent reads the repository, makes the change, and opens a change request for you to review.';

/** Body rungs (kit `typography.md`). The line height ships with the rung. */
const SIZES = [
  { label: 'Large body text', className: 'text-base text-pretty', note: 'Long-form prose only: docs, blog, marketing body.' },
  { label: 'Base body text', className: 'text-sm text-pretty', note: 'The app body: row titles, labels, button text.' },
  { label: 'Small body text', className: 'text-xs text-pretty', note: 'Meta and row descriptions. The workhorse, and the floor.' },
] as const;

const WEIGHTS = [
  { label: 'Regular', className: 'text-sm font-normal', text: 'Regular body text, 400. The app body is 500, so write font-normal.' },
  { label: 'Medium', className: 'text-sm font-medium', text: 'Medium body text. Row titles, labels, active nav.' },
  { label: 'Semibold', className: 'text-sm font-semibold', text: 'Semibold body text. Titles only, never a run of body.' },
] as const;

const INKS = [
  { label: 'Primary read', className: 'text-sm text-foreground', text: 'The first thing to read on the row.' },
  { label: 'Second read', className: 'text-sm text-muted-foreground', text: 'The description, the meta, the idle state.' },
] as const;

export default function TextPage() {
  return (
    <DocPage
      title="Text"
      lead="Three body rungs, three weights, two inks. Each rung carries its own line height, so a paragraph needs no leading class."
    >
      <DocSection
        title="Sizes"
        description="text-xs is 13px here, not Tailwind's 12px. There is no rung below it: if 13px looks too big, change the layout, not the scale."
      >
        <Example
          previewClassName={SPECIMEN_PREVIEW}
          code={specimenCode(SIZES.map((s) => ({ tag: 'p', className: s.className, text: SAMPLE })))}
        >
          {SIZES.map((s) => (
            <Specimen key={s.label} label={s.label} meta={s.className} note={s.note}>
              <p className={s.className}>{SAMPLE}</p>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Weights" description="400, 500 and 600. No bold, no light.">
        <Example
          previewClassName={SPECIMEN_PREVIEW}
          code={specimenCode(WEIGHTS.map((w) => ({ tag: 'p', ...w })))}
        >
          {WEIGHTS.map((w) => (
            <Specimen key={w.label} label={w.label} meta={w.className}>
              <p className={w.className}>{w.text}</p>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Color"
        description="Two inks make the hierarchy. Never fade text with opacity: a faded ink is a third grey that fails contrast on a tinted ground."
      >
        <Example previewClassName={SPECIMEN_PREVIEW} code={specimenCode(INKS.map((i) => ({ tag: 'p', ...i })))}>
          {INKS.map((i) => (
            <Specimen key={i.label} label={i.label} meta={i.className}>
              <p className={i.className}>{i.text}</p>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Numbers"
        description="A number that ticks or sorts takes tabular-nums, so a change from 9 to 10 does not move its neighbors."
      >
        <Example
          previewClassName={SPECIMEN_PREVIEW}
          code={`<p className="text-sm">1,111 sessions · 98.0% uptime</p>
<p className="text-sm tabular-nums">1,111 sessions · 98.0% uptime</p>`}
        >
          <Specimen label="Proportional" meta="text-sm">
            <p className="text-sm">1,111 sessions · 98.0% uptime</p>
          </Specimen>
          <Specimen label="Tabular" meta="text-sm tabular-nums">
            <p className="text-sm tabular-nums">1,111 sessions · 98.0% uptime</p>
          </Specimen>
        </Example>
      </DocSection>
    </DocPage>
  );
}
