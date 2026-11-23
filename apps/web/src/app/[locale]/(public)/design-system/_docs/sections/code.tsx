'use client';

import { cn } from '@kortix/ui';
import { INLINE_CODE } from '@kortix/ui/markdown';

import { DocPage, DocSection, Example } from '../doc';
import { SPECIMEN_PREVIEW, Specimen } from './specimen';

/**
 * Inline code is the markdown chip (`INLINE_CODE` in
 * packages/ui/src/markdown/code/inline-chip.tsx): Roobert Mono on a card fill
 * with a hairline. A size or an ink is one class merged on top with cn().
 */
const SIZES = [
  { label: 'Base', cls: 'text-sm', note: 'Beside text-sm body.' },
  { label: 'Small', cls: 'text-xs', note: 'In meta rows and captions.' },
] as const;

const COLORS = [
  { label: 'Foreground', cls: 'text-foreground', note: 'The default. Literal text in a sentence.' },
  { label: 'Muted', cls: 'text-muted-foreground', note: 'A secondary identifier in a meta row.' },
  { label: 'Link', cls: 'text-kortix-base', note: 'An identifier that opens something. kortix-base is the link hue.' },
  { label: 'Destructive', cls: 'text-destructive', note: 'A command that deletes data.' },
] as const;

const SAMPLE = 'session_id';

function chipCode(cls: string, text = SAMPLE) {
  return `<code className={cn(INLINE_CODE, '${cls}')}>${text}</code>`;
}

export default function CodePage() {
  return (
    <DocPage
      title="Code"
      lead="Roobert Mono marks literal text: a command, a path, an identifier, a key. In running text it sits in the inline chip, which shares the baseline of the line it interrupts."
    >
      <DocSection title="Sizes" description="Merge a size onto the chip. Use the rung of the text around it.">
        <Example previewClassName={SPECIMEN_PREVIEW} code={SIZES.map((s) => chipCode(s.cls)).join('\n')}>
          {SIZES.map((s) => (
            <Specimen key={s.label} label={s.label} meta={`cn(INLINE_CODE, '${s.cls}')`} note={s.note}>
              <code className={cn(INLINE_CODE, s.cls)}>{SAMPLE}</code>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Colors"
        description="Ink by default. A hue goes on code only when the code is the action: a link, or a command that destroys."
      >
        <Example previewClassName={SPECIMEN_PREVIEW} code={COLORS.map((c) => chipCode(c.cls)).join('\n')}>
          {COLORS.map((c) => (
            <Specimen key={c.label} label={c.label} meta={c.cls} note={c.note}>
              <code className={cn(INLINE_CODE, c.cls)}>{SAMPLE}</code>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="In a line"
        description="With no size class, the chip follows its context in em: it reads at body size in a paragraph and scales up inside a heading, so it never looks like body text in a title."
      >
        <Example
          previewClassName={SPECIMEN_PREVIEW}
          code={`<p className="text-sm">
  Pass the <code className={INLINE_CODE}>session_id</code> to resume the session.
</p>
<h3 className="text-xl font-medium">
  Configure <code className={INLINE_CODE}>kortix.yaml</code>
</h3>`}
        >
          <Specimen label="In body text" meta="text-sm">
            <p className="text-sm">
              Pass the <code className={INLINE_CODE}>session_id</code> to resume the session.
            </p>
          </Specimen>
          <Specimen label="In a heading" meta="text-xl font-medium">
            <h3 className="text-xl font-medium">
              Configure <code className={INLINE_CODE}>kortix.yaml</code>
            </h3>
          </Specimen>
        </Example>
      </DocSection>
    </DocPage>
  );
}
