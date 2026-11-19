'use client';

import { cn } from '@kortix/ui';
import { useEffect, useRef, useState } from 'react';

import { DocPage, DocSection, Example, TokenLabel } from '../doc';

/**
 * The corner ladder (kit `effects.md`, "Radius") and the control radii
 * (`--control-<size>-radius`, D44: one corner per size, about a quarter of the height). Class names only: the px under each tile
 * is the radius the browser computed, so the page cannot drift from
 * globals.css.
 */
const LADDER = [
  { name: 'rounded-sm', cls: 'rounded-sm', use: 'Status tiles, small chips, menu rows' },
  { name: 'rounded-md', cls: 'rounded-md', use: 'Panels, rows, cards, buttons, fields. The default.' },
  { name: 'rounded-lg', cls: 'rounded-lg', use: 'Floating panels: menu, popover, select content' },
  { name: 'rounded-xl', cls: 'rounded-xl', use: 'Rare. Large media containers.' },
  { name: 'rounded-2xl', cls: 'rounded-2xl', use: 'Marketing and docs surfaces only' }, // audit:allow showcase of the marketing radius
  { name: 'rounded-full', cls: 'rounded-full', use: 'Pills: badges, avatars, pill buttons' },
] as const;

const CONTROLS = [
  { name: 'xs', cls: 'rounded-(--control-xs-radius)', use: 'Checkbox' },
  { name: 'sm', cls: 'rounded-(--control-sm-radius)', use: 'Button, Select, Tabs and Input at sm' },
  { name: 'md', cls: 'rounded-(--control-md-radius)', use: 'Button, Select, Tabs and Input at md' },
  { name: 'lg', cls: 'rounded-(--control-lg-radius)', use: 'Button, Select, Tabs and Input at lg' },
  { name: 'xl', cls: 'rounded-(--control-xl-radius)', use: 'Button, Select, Tabs and Input at xl' },
  { name: '2xl', cls: 'rounded-(--control-2xl-radius)', use: 'Tabs at 2xl' },
] as const;

/** The radius the browser resolved on the tile. A pill reads as "full". */
function useRadius() {
  const ref = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState('');
  useEffect(() => {
    if (!ref.current) return;
    const value = parseFloat(getComputedStyle(ref.current).borderTopLeftRadius);
    if (Number.isNaN(value)) return;
    setPx(value >= 999 ? 'full' : `${Math.round(value * 100) / 100}px`);
  }, []);
  return { ref, px };
}

function Tile({ name, cls, use }: { name: string; cls: string; use: string }) {
  const { ref, px } = useRadius();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div ref={ref} className={cn('bg-muted aspect-square w-full', cls)} />
      <div className="flex min-w-0 flex-col gap-1">
        <TokenLabel name={name} value={px || '…'} />
        <span className="text-muted-foreground text-xs text-pretty">{use}</span>
      </div>
    </div>
  );
}

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 p-4 sm:grid-cols-3';

export default function RadiusPage() {
  return (
    <DocPage
      title="Radius"
      lead="One ladder for surfaces, one for controls. If you are not sure, it is rounded-md. A nested corner is concentric: the inner radius is the outer radius minus the inset, or the child is flush."
    >
      <DocSection
        title="Ladder"
        description="Derived from --radius. The 16px step is for marketing and docs surfaces, never app chrome. The bare 4px class is legacy: write rounded-sm."
      >
        <Example
          previewClassName={GRID}
          code={LADDER.map((r) => `<div className="${r.cls} bg-muted aspect-square w-full" />`).join('\n')}
        >
          {LADDER.map((r) => (
            <Tile key={r.name} {...r} />
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Control radii"
        description="A control reads its radius from the control ladder, so a Button, a Tab, a Select and an Input of one size share a corner, about a quarter of its height. Icon-only buttons use the same corner."
      >
        <Example
          previewClassName={GRID}
          code={CONTROLS.map((c) => `<div className="${c.cls} bg-muted aspect-square w-full" />`).join('\n')}
        >
          {CONTROLS.map((c) => (
            <Tile key={c.name} name={`--control-${c.name}-radius`} cls={c.cls} use={c.use} />
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Concentric nesting"
        description="A rounded-lg panel with p-1 holds rounded-sm rows: 10px minus 4px is 6px. The corners keep one even gap."
      >
        <Example
          code={`<div className="bg-popover border-border w-56 rounded-lg border p-1">
  <div className="bg-muted rounded-sm px-3 py-1.5 text-sm">Menu row</div>
  <div className="rounded-sm px-3 py-1.5 text-sm">Menu row</div>
</div>`}
        >
          <div className="bg-popover border-border w-56 rounded-lg border p-1">
            <div className="bg-muted rounded-sm px-3 py-1.5 text-sm">Menu row</div>
            <div className="rounded-sm px-3 py-1.5 text-sm">Menu row</div>
          </div>
        </Example>
      </DocSection>
    </DocPage>
  );
}
