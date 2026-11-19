'use client';

import { DocPage, DocSection, Example } from '../doc';
import { SPECIMEN_PREVIEW, Specimen, specimenCode } from './specimen';

const SAMPLE = 'Updated 4 minutes ago by the release agent';

/**
 * Caption rungs. The scale stops at text-xs (13px): there is no smaller
 * caption, so this page shows two sizes where other systems show four.
 */
const SIZES = [
  { label: 'Large caption', className: 'text-sm text-muted-foreground', note: 'A description under a modal title or a section title.' },
  { label: 'Base caption', className: 'text-xs text-muted-foreground', note: 'Row meta, timestamps, helper text. The default caption.' },
] as const;

const WEIGHTS = [
  { label: 'Regular', className: 'text-xs font-normal text-muted-foreground', text: 'Regular caption' },
  { label: 'Medium', className: 'text-xs font-medium text-muted-foreground', text: 'Medium caption' },
  { label: 'Semibold', className: 'text-xs font-semibold text-muted-foreground', text: 'Semibold caption' },
] as const;

const CASING = [
  {
    label: 'Normal caption',
    className: 'text-xs text-muted-foreground',
    text: 'Normal caption',
    note: 'Sentence case. Every caption in the app.',
  },
  {
    label: 'Uppercase caption',
    className: 'font-mono text-xs tracking-wider uppercase text-muted-foreground', // audit:allow the marketing eyebrow, shown as a specimen
    text: 'Uppercase caption',
    note: 'The mono eyebrow. Marketing, docs and decks only: one per section. Never in app chrome.',
  },
] as const;

export default function CaptionPage() {
  return (
    <DocPage
      title="Caption"
      lead="Captions are the second read: meta, timestamps, descriptions. They are muted ink at text-sm or text-xs, and sentence case everywhere in the app."
    >
      <DocSection
        title="Sizes"
        description="Two sizes. text-xs (13px) is the floor of the scale, so there is no small or extra-small caption. If a caption does not fit at 13px, the layout is wrong, not the size."
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

      <DocSection
        title="Weights"
        description="Regular is the caption. Medium marks the one word that matters in a row. Semibold is on the ladder, but a caption rarely needs it."
      >
        <Example previewClassName={SPECIMEN_PREVIEW} code={specimenCode(WEIGHTS.map((w) => ({ tag: 'p', ...w })))}>
          {WEIGHTS.map((w) => (
            <Specimen key={w.label} label={w.label} meta={w.className}>
              <p className={w.className}>{w.text}</p>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Casing"
        description="The app has no all-caps or letter-spaced label: the mono Badge chip is the one exception. A marketing or docs section may carry one all-caps mono eyebrow at text-xs."
      >
        <Example
          previewClassName={SPECIMEN_PREVIEW}
          code={specimenCode(CASING.map(({ className, text }) => ({ tag: 'p', className, text })))}
        >
          {CASING.map((c) => (
            <Specimen key={c.label} label={c.label} meta={c.className} note={c.note}>
              <p className={c.className}>{c.text}</p>
            </Specimen>
          ))}
        </Example>
      </DocSection>
    </DocPage>
  );
}
