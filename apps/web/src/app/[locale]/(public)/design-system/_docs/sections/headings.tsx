'use client';

import { DocPage, DocSection, Example } from '../doc';
import { SPECIMEN_PREVIEW, Specimen, specimenCode } from './specimen';

/**
 * Six heading levels mapped to the Kortix type rungs (kit `typography.md`).
 * 2xl and up are semibold + tracking-tight; below that a title is medium.
 * The size comes from the rung, never from the tag.
 */
const SIZES = [
  { tag: 'h1', label: 'Heading 1', className: 'text-3xl font-semibold tracking-tight', role: 'Display. Marketing and docs only, never in app chrome.' }, // audit:allow showcase of the marketing display rung
  { tag: 'h2', label: 'Heading 2', className: 'text-2xl font-semibold tracking-tight', role: 'Detail-view title. The app ceiling.' },
  { tag: 'h3', label: 'Heading 3', className: 'text-xl font-medium', role: 'Section page title (Members, Secrets, Triggers).' },
  { tag: 'h4', label: 'Heading 4', className: 'text-lg font-medium', role: 'Rare sub-heading. A split-modal title.' },
  { tag: 'h5', label: 'Heading 5', className: 'text-base font-medium', role: 'A heading inside long-form prose.' },
  { tag: 'h6', label: 'Heading 6', className: 'text-sm font-medium', role: 'Panel section label, row title.' },
] as const;

const WEIGHTS = [
  { tag: 'h3', label: 'Regular', className: 'text-xl font-normal', text: 'Regular heading' },
  { tag: 'h3', label: 'Medium', className: 'text-xl font-medium', text: 'Medium heading' },
  { tag: 'h3', label: 'Semibold', className: 'text-xl font-semibold', text: 'Semibold heading' },
] as const;

export default function HeadingsPage() {
  return (
    <DocPage
      title="Headings"
      lead="Six levels on the Kortix type rungs. Pick the size from the rung, not from the tag: a page has one h1, a section takes h2, and the classes set the size."
    >
      <DocSection
        title="Sizes"
        description="24px is the app ceiling. Heading 1 at 30px is for marketing and docs pages only. From 24px up, a heading is semibold with tracking-tight; below that it is medium."
      >
        <Example
          previewClassName={SPECIMEN_PREVIEW}
          code={specimenCode(SIZES.map((s) => ({ tag: s.tag, className: `${s.className} text-balance`, text: s.label })))}
        >
          {SIZES.map((s) => {
            const Tag = s.tag;
            return (
              <Specimen key={s.tag} label={s.tag} meta={s.className} note={s.role}>
                <Tag className={`${s.className} text-balance`}>{s.label}</Tag>
              </Specimen>
            );
          })}
        </Example>
      </DocSection>

      <DocSection
        title="Weights"
        description="Three weights and no others: 400, 500 and 600. There is no bold. To make a title louder, take the next rung up."
      >
        <Example previewClassName={SPECIMEN_PREVIEW} code={specimenCode(WEIGHTS)}>
          {WEIGHTS.map((w) => {
            const Tag = w.tag;
            return (
              <Specimen key={w.label} label={w.label} meta={w.className}>
                <Tag className={w.className}>{w.text}</Tag>
              </Specimen>
            );
          })}
        </Example>
      </DocSection>

      <DocSection
        title="Wrapping"
        description="A title that can wrap takes text-balance, so the last line is not a single word."
      >
        <Example
          code={`<h2 className="text-2xl font-semibold tracking-tight text-balance">
  A detail-view title that runs long enough to wrap onto a second line in this preview
</h2>`}
        >
          <h2 aria-hidden className="text-2xl font-semibold tracking-tight text-balance">
            A detail-view title that runs long enough to wrap onto a second line in this preview
          </h2>
        </Example>
      </DocSection>
    </DocPage>
  );
}
