'use client';

import { cn, useIsDark } from '@kortix/ui';
import { useEffect, useRef, useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';
import { AccentRow, toHex } from '../../live-tokens';

/**
 * Class names only. Every swatch is painted with its real utility, and the
 * value under it is the color the browser resolved, read back with
 * getComputedStyle. On a light page each swatch also paints a `.dark` scope,
 * so both themes show side by side. Values come from globals.css, generated
 * from `.agents/skills/kortix-brand/references/visual/visual-system.json`.
 */
interface Swatch {
  name: string;
  /** The class you write. */
  utility: string;
  /** The class that paints the swatch. Full literal, so Tailwind compiles it. */
  fill: string;
  use: string;
}

const SURFACES: Swatch[] = [
  { name: 'Background', utility: 'bg-background', fill: 'bg-background', use: 'The page itself. Canvas.' },
  { name: 'Pane', utility: 'bg-pane', fill: 'bg-pane', use: 'The content pane inside the app shell.' },
  { name: 'Frame', utility: 'bg-frame', fill: 'bg-frame', use: 'The recessed app frame behind a lifted bg-popover sheet. This page uses it.' },
  { name: 'Surface', utility: 'bg-surface', fill: 'bg-surface', use: 'A full-bleed pane that stands in for the page. Nothing else.' },
  { name: 'Card', utility: 'bg-card', fill: 'bg-card', use: 'Surface 1: a lifted region.' },
  { name: 'Accent', utility: 'bg-accent', fill: 'bg-accent', use: 'Surface 1: a hover surface.' },
  { name: 'Sidebar', utility: 'bg-sidebar', fill: 'bg-sidebar', use: 'Surface 1: the sidebar.' },
  { name: 'Secondary', utility: 'bg-secondary', fill: 'bg-secondary', use: 'Surface 2: inset controls, chips.' },
  { name: 'Muted', utility: 'bg-muted', fill: 'bg-muted', use: 'Surface 2: track wells, filled tiles.' },
  { name: 'Popover', utility: 'bg-popover', fill: 'bg-popover', use: 'Top surface: overlays, fields, a panel inside a panel.' },
];

const TEXT: Swatch[] = [
  { name: 'Foreground', utility: 'text-foreground', fill: 'bg-foreground', use: 'The primary read.' },
  { name: 'Muted foreground', utility: 'text-muted-foreground', fill: 'bg-muted-foreground', use: 'Descriptions, meta, idle state.' },
  { name: 'Primary foreground', utility: 'text-primary-foreground', fill: 'bg-primary-foreground', use: 'Text on a primary fill.' },
];

const ACTION: Swatch[] = [
  { name: 'Primary', utility: 'bg-primary', fill: 'bg-primary', use: 'The primary button fill. Ink, not a hue.' },
  { name: 'Destructive', utility: 'bg-destructive', fill: 'bg-destructive', use: 'A destructive action. Not a status.' },
  { name: 'Hover', utility: 'hover:bg-hover', fill: 'bg-hover', use: 'Transient hover. Translucent ink.' },
  { name: 'Active', utility: 'bg-active', fill: 'bg-active', use: 'Persistent selection. Translucent ink.' },
];

const LINES: Swatch[] = [
  { name: 'Border', utility: 'border-border', fill: 'bg-border', use: 'Every content border. One hairline color.' },
  { name: 'Sidebar border', utility: 'border-sidebar-border', fill: 'bg-sidebar-border', use: 'The sidebar edge. Softer in dark.' },
  { name: 'Ring', utility: 'focus-visible:ring-ring', fill: 'bg-ring', use: 'The focus ring. Aliases kortix-base.' },
];

const CHART: Swatch[] = [
  { name: 'Chart 1', utility: 'var(--chart-1)', fill: 'bg-(--chart-1)', use: 'Series 1' },
  { name: 'Chart 2', utility: 'var(--chart-2)', fill: 'bg-(--chart-2)', use: 'Series 2' },
  { name: 'Chart 3', utility: 'var(--chart-3)', fill: 'bg-(--chart-3)', use: 'Series 3' },
  { name: 'Chart 4', utility: 'var(--chart-4)', fill: 'bg-(--chart-4)', use: 'Series 4' },
  { name: 'Chart 5', utility: 'var(--chart-5)', fill: 'bg-(--chart-5)', use: 'Series 5' },
];

/** The `kortix-*` accents: the only source of hue (D5). Same value in both themes. */
const ACCENTS = [
  { name: 'kortix-base', token: '--kortix-base', meaning: 'Brand, focus, links. Aliases --ring.', dot: 'bg-kortix-base', tint: 'bg-kortix-base/15' },
  { name: 'kortix-green', token: '--kortix-green', meaning: 'Success, running, connected, merged', dot: 'bg-kortix-green', tint: 'bg-kortix-green/15' },
  { name: 'kortix-red', token: '--kortix-red', meaning: 'Error, failed', dot: 'bg-kortix-red', tint: 'bg-kortix-red/15' },
  { name: 'kortix-orange', token: '--kortix-orange', meaning: 'Warning, needs attention, refused by policy', dot: 'bg-kortix-orange', tint: 'bg-kortix-orange/15' },
  { name: 'kortix-yellow', token: '--kortix-yellow', meaning: 'Pending, awaiting you', dot: 'bg-kortix-yellow', tint: 'bg-kortix-yellow/15' },
  { name: 'kortix-blue', token: '--kortix-blue', meaning: 'Info, open, in review', dot: 'bg-kortix-blue', tint: 'bg-kortix-blue/15' },
  { name: 'kortix-purple', token: '--kortix-purple', meaning: 'The owner role badge. Nothing else.', dot: 'bg-kortix-purple', tint: 'bg-kortix-purple/15' },
] as const;

/** One meaning, one hue. The word carries the state; the dot repeats it. */
const STATUS = [
  { label: 'Running', dot: 'bg-kortix-green', tint: 'bg-kortix-green/15' },
  { label: 'Failed', dot: 'bg-kortix-red', tint: 'bg-kortix-red/15' },
  { label: 'Needs attention', dot: 'bg-kortix-orange', tint: 'bg-kortix-orange/15' },
  { label: 'Pending', dot: 'bg-kortix-yellow', tint: 'bg-kortix-yellow/15' },
  { label: 'In review', dot: 'bg-kortix-blue', tint: 'bg-kortix-blue/15' },
  { label: 'Idle', dot: 'bg-muted-foreground', tint: 'bg-muted' },
] as const;

/** The color the browser resolved on `ref`, re-read when the page theme flips. */
function useResolvedFill(fill: string, pageDark: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(ref.current).backgroundColor;
    setValue(toHex(css) ?? 'transparent');
  }, [fill, pageDark]);
  return { ref, value };
}

function Pane({ fill, dark, pageDark }: { fill: string; dark?: boolean; pageDark: boolean }) {
  const { ref, value } = useResolvedFill(fill, pageDark);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* `.dark` on the pane re-declares every token for that element. */}
      <div ref={ref} className={cn('border-border h-14 rounded-sm border', fill, dark && 'dark')} />
      <span className="text-muted-foreground truncate font-mono text-xs">{value || '…'}</span>
    </div>
  );
}

function SwatchTile({ swatch }: { swatch: Swatch }) {
  const pageDark = useIsDark();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className={cn('grid gap-1', pageDark ? 'grid-cols-1' : 'grid-cols-2')}>
        <Pane fill={swatch.fill} pageDark={pageDark} />
        {pageDark ? null : <Pane fill={swatch.fill} dark pageDark={pageDark} />}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{swatch.name}</span>
        <span className="text-muted-foreground truncate font-mono text-xs">{swatch.utility}</span>
        <span className="text-muted-foreground text-xs text-pretty">{swatch.use}</span>
      </div>
    </div>
  );
}

const GRID = 'grid grid-cols-1 gap-x-4 gap-y-6 p-4 sm:grid-cols-2 lg:grid-cols-3';

function SwatchExample({ swatches, code }: { swatches: Swatch[]; code?: string }) {
  return (
    <Example
      previewClassName={GRID}
      code={code ?? swatches.map((s) => `<div className="${s.utility}" />`).join('\n')}
    >
      {swatches.map((s) => (
        <SwatchTile key={s.name} swatch={s} />
      ))}
    </Example>
  );
}

export default function ColorsPage() {
  return (
    <DocPage
      title="Colors"
      lead="Semantic tokens and kortix-* accents, and nothing else. Every token carries both themes, so you never write dark: for color. Each swatch shows the value the browser resolved: light on the left, dark on the right."
    >
      <DocSection
        title="Surfaces"
        description="Pick a neutral by depth, not by taste: the lowest step that still separates the element from its ground."
      >
        <SwatchExample swatches={SURFACES} />
      </DocSection>

      <DocSection
        title="Text"
        description="Two inks make the hierarchy. Need a third? The layout has too many levels. Never fade text with opacity."
      >
        <SwatchExample
          swatches={TEXT}
          code={`<p className="text-foreground">Primary read</p>
<p className="text-muted-foreground">Second read</p>
<span className="bg-primary text-primary-foreground">On a primary fill</span>`}
        />
      </DocSection>

      <DocSection
        title="Actions and states"
        description="Primary is ink. Hover and selected are translucent ink, so they compose over any surface."
      >
        <SwatchExample
          swatches={ACTION}
          code={`<button className="bg-primary text-primary-foreground">Save</button>
<button className="bg-destructive text-destructive-foreground">Delete</button>
<div className="hover:bg-hover">Row</div>
<div className="bg-active">Selected row</div>`}
        />
      </DocSection>

      <DocSection title="Border and focus" description="One hairline color, 1px. Focus is the ring, never removed.">
        <SwatchExample
          swatches={LINES}
          code={`<div className="border-border border" />
<aside className="border-sidebar-border border-e" />
<button className="focus-visible:ring-ring focus-visible:ring-2" />`}
        />
      </DocSection>

      <DocSection
        title="Accents"
        description="The only source of hue. The same value in light and dark. An accent paints a glyph, a dot, a /15 tint or a chart; the label beside it stays ink, because every accent fails AA as body text."
      >
        <Example
          previewClassName="flex-col flex-nowrap items-stretch gap-0 px-4 py-0"
          code={ACCENTS.map((a) => `<span className="${a.dot} size-3 rounded-full" />\n<span className="${a.tint}">…</span>`).join('\n')}
        >
          {ACCENTS.map((a) => (
            <AccentRow key={a.token} token={a.token} name={a.name} meaning={a.meaning} dotClass={a.dot} tintClass={a.tint} />
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Status"
        description="One hue per meaning. Color is never the only carrier: the word says the state and the dot repeats it. A state not in this list is idle and takes no hue."
      >
        <Example
          code={STATUS.map(
            (s) =>
              `<span className="${s.tint} inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs text-foreground">\n  <span className="${s.dot} size-1.5 rounded-full" />\n  ${s.label}\n</span>`,
          ).join('\n')}
        >
          {STATUS.map((s) => (
            <span
              key={s.label}
              className={cn('text-foreground inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs', s.tint)}
            >
              <span className={cn('size-1.5 rounded-full', s.dot)} />
              {s.label}
            </span>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Chart"
        description="Data visualization only. Read the ramp through var(--chart-n); it is the same in both themes."
      >
        <SwatchExample
          swatches={CHART}
          code={CHART.map((c) => `<rect fill="${c.utility}" />`).join('\n')}
        />
      </DocSection>
    </DocPage>
  );
}
