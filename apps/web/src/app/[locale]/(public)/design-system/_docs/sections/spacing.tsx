'use client';

import { SpacingBase, SpacingRow } from '../../live-tokens';
import { CodeSample, DocPage, DocSection, Example } from '../doc';

/**
 * The --spacing scale and the canonical web rhythm (kit `layout.md`,
 * "Spacing" and "Canonical rhythm"). The px beside each bar is measured from
 * the rendered element, so the page cannot drift from globals.css.
 */
const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 16, 20, 24] as const;

const RHYTHM = [
  ['Page container', 'mx-auto w-full max-w-2xl'],
  ['Section vertical padding', 'px-4 py-10 pb-20 lg:py-20'],
  ['Header to body', 'space-y-5'],
  ['Settings major sections', 'space-y-8'],
  ['Tab panel content', 'space-y-6'],
  ['Search and content block', 'space-y-4'],
  ['List of rows', 'space-y-2'],
  ['Panel inner padding', 'px-4 py-5 · px-4 py-3 compact · px-4 py-2 row'],
  ['Row internal gap', 'gap-3'],
  ['Title and meta gap', 'gap-1.5'],
  ['Button group gap', 'gap-2'],
] as const;

export default function SpacingPage() {
  return (
    <DocPage
      title="Spacing"
      lead="One scale behind every padding, margin and gap. The base is 0.23rem, 8% tighter than stock Tailwind: a 16px mockup padding is p-4, never a bracket value."
    >
      <DocSection
        title="Steps"
        description="Below 4, half steps are legal and common. Above 4, use whole steps only. The px is what the browser computed for each bar."
      >
        <Example
          previewClassName="flex-col items-stretch gap-4"
          code={`<div className="p-4" />   {/* 16px in a mockup */}\n<div className="gap-2" /> {/* 8px in a mockup */}`}
        >
          <SpacingBase />
          <div className="flex flex-col gap-2.5">
            {STEPS.map((step) => (
              <SpacingRow key={step} step={step} />
            ))}
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Canonical rhythm"
        description="Take layout values from this table first, so every settings page reads as one product."
      >
        <div className="border-border overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-2 text-start font-medium">Layer</th>
                <th className="px-4 py-2 text-start font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {RHYTHM.map(([layer, value]) => (
                <tr key={layer}>
                  <td className="px-4 py-2">{layer}</td>
                  <td className="text-muted-foreground px-4 py-2 font-mono text-xs">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection
        title="One owner per gap"
        description="A gap comes from the parent (gap, space-y) or from a child margin, never both. A bordered panel that hosts flush children pads its inner sections, not the box."
      >
        <CodeSample
          code={`// One owner: the parent.
<div className="space-y-2">
  <Row />
  <Row />
</div>

// Two owners: the rhythm breaks.
<div className="space-y-2">
  <Row className="mt-2" />
</div>`}
        />
      </DocSection>

      <DocSection
        title="The one bracket exception"
        description="Whole-pixel geometry: a ring, a hairline, device-pixel snapping. A comment beside it states the arithmetic. If the value is not 1px or 2px, or no comment states the arithmetic, it is a violation."
      >
        <CodeSample code={`// p-0.5 is 1.84px; 2px leaves exactly 1px of track on every side.\n<div className="p-[2px]" />`} />
      </DocSection>
    </DocPage>
  );
}
