'use client';

import { Button } from '@kortix/ui/button';
import { KortixLoader } from '@kortix/ui/kortix-loader';
import Loading from '@kortix/ui/loading';
import { TextShimmer } from '@kortix/ui/text-shimmer';

import { DocPage, DocSection, Example, TokenLabel } from '../doc';

const VARIANTS = [
  ['orbit', 'The default. A track with one arc that orbits and breathes.'],
  ['spokes', 'Eight spokes on a fading ramp that tick one step at a time. Reads well small and beside text.'],
  ['ring', 'The orbit motion on the status-icon circle, for a column beside static status glyphs.'],
] as const;

const SIZES = ['size-3', 'size-4', 'size-5', 'size-6'] as const;

export default function LoadingPage() {
  return (
    <DocPage
      title="Loading"
      lead="Loading is the one spinner on web. Never spin an icon. It is 16px and paints in the text color, and it inverts by itself inside a filled button."
    >
      <DocSection title="Variants">
        <Example
          previewClassName="grid grid-cols-1 gap-4 sm:grid-cols-3"
          code={VARIANTS.map(([v]) => `<Loading variant="${v}" />`).join('\n')}
        >
          {VARIANTS.map(([v, about]) => (
            <div key={v} className="flex items-start gap-3">
              <Loading variant={v} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-xs">{v}</span>
                <span className="text-muted-foreground text-xs text-pretty">{about}</span>
              </div>
            </div>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Sizes" description="Size it with a size-* class. 16px is the default; match the icon size of the control it replaces.">
        <Example
          previewClassName="flex-col items-start gap-4"
          code={SIZES.map((s) => `<Loading className="${s}" />`).join('\n')}
        >
          {VARIANTS.map(([v]) => (
            <div key={v} className="flex items-center gap-4">
              {SIZES.map((s) => (
                <Loading key={s} variant={v} className={s} />
              ))}
            </div>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="In a button"
        description="Set pending on the Button. The label hides, the width holds, and the ring variant takes its place. Do not put a Loading inside a Button by hand."
      >
        <Example
          code={`<Button pending>Save</Button>
<Button variant="secondary" pending>Save</Button>
<Button variant="outline" pending>Save</Button>`}
        >
          <Button pending>Save</Button>
          <Button variant="secondary" pending>
            Save
          </Button>
          <Button variant="outline" pending>
            Save
          </Button>
        </Example>
      </DocSection>

      <DocSection
        title="Beside text"
        description="An inline state of a row or a line: the spinner, then the words, at the size of the text."
      >
        <Example
          code={`<span className="text-muted-foreground flex items-center gap-2 text-sm">
  <Loading variant="spokes" className="size-3.5 text-muted-foreground" />
  Syncing files
</span>`}
        >
          <span className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loading variant="spokes" className="size-3.5 text-muted-foreground" />
            Syncing files
          </span>
        </Example>
      </DocSection>

      <DocSection
        title="Text shimmer"
        description="A sweep across a line of text, for a status that names the work in progress. It loops by default; repeat={1} plays it once."
      >
        <Example
          code={`<TextShimmer>Thinking</TextShimmer>
<TextShimmer duration={1.5}>Reading 12 files</TextShimmer>`}
        >
          <TextShimmer>Thinking</TextShimmer>
          <TextShimmer duration={1.5}>Reading 12 files</TextShimmer>
        </Example>
      </DocSection>

      <DocSection
        title="KortixLoader"
        description="A border spinner sized by preset. It follows the theme, and variant pins it for a ground that does not. On web, prefer Loading; KortixLoader is the mobile spinner and a legacy one on web."
      >
        <Example
          code={`<KortixLoader size="small" />
<KortixLoader size="medium" />
<KortixLoader size="large" />
<KortixLoader size="xlarge" />`}
        >
          {(['small', 'medium', 'large', 'xlarge'] as const).map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <KortixLoader size={s} />
              <TokenLabel name={s} value={`${{ small: 20, medium: 24, large: 32, xlarge: 40 }[s]}px`} />
            </div>
          ))}
        </Example>
      </DocSection>
    </DocPage>
  );
}
