'use client';

import { DocPage, DocSection, Example, TokenLabel } from '../doc';

/**
 * Elevation (kit `effects.md`, D44). `shadow-*` is a ladder of stacked smooth
 * shadows; `shadow-ring-*` is the same shadow with a 1px hairline as its last
 * layer. In page flow a surface takes a border and no shadow. A floating one
 * takes `shadow-ring-*` and no border: one edge, not a stroke plus a shadow.
 */
const STEPS = [
  { size: 'xs', use: 'Chips, slider thumbs, the raised segmented chip' },
  { size: 'sm', use: 'Sticky bars, elevated cards' },
  { size: 'md', use: 'Selects, menus, popovers, the combobox' },
  { size: 'lg', use: 'Modals, sheets, toasts' },
  { size: 'xl', use: 'Command palette, floating windows' },
  { size: '2xl', use: 'Marketing hero surfaces only' },
] as const;

// Literal class names: Tailwind reads them from source.
const SHADOW = { xs: 'shadow-xs', sm: 'shadow-sm', md: 'shadow-md', lg: 'shadow-lg', xl: 'shadow-xl', '2xl': 'shadow-2xl' } as const; // audit:allow showcase row naming each step
const RING = {
  xs: 'shadow-ring-xs',
  sm: 'shadow-ring-sm',
  md: 'shadow-ring-md',
  lg: 'shadow-ring-lg',
  xl: 'shadow-ring-xl',
  '2xl': 'shadow-ring-2xl',
} as const;

function Tile({ cls, name, value, use }: { cls: string; name: string; value: string; use: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className={`bg-popover h-24 w-full rounded-lg ${cls}`} />
      <div className="flex min-w-0 flex-col gap-1">
        <TokenLabel name={name} value={value} />
        <span className="text-muted-foreground text-xs text-pretty">{use}</span>
      </div>
    </div>
  );
}

export default function ShadowsPage() {
  return (
    <DocPage
      title="Shadows"
      lead="Elevation means one thing: this floats above the page. Anything in page flow is flat and draws a hairline border. A floating surface takes a smooth stacked shadow with the hairline built in, and no border."
    >
      <DocSection
        title="Shadow + ring"
        description="For anything that floats: menus, selects, popovers, dialogs, toasts. The last layer is a 1px hairline (black at 5% in light, white at 18% in dark), so the edge dissolves into the shadow instead of sitting beside it."
      >
        <Example
          previewClassName="bg-muted grid grid-cols-1 gap-8 p-8 sm:grid-cols-2 lg:grid-cols-3"
          code={STEPS.map((s) => `<div className="bg-popover rounded-lg ${RING[s.size]}" />`).join('\n')}
        >
          {STEPS.map((s) => (
            <Tile key={s.size} cls={RING[s.size]} name={RING[s.size]} value="shadow + hairline" use={s.use} />
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Shadow"
        description="The same stacks with no ring, for a surface whose edge is drawn another way, such as an image or a filled button."
      >
        <Example
          previewClassName="bg-muted grid grid-cols-1 gap-8 p-8 sm:grid-cols-2 lg:grid-cols-3"
          code={STEPS.map((s) => `<div className="bg-popover rounded-lg ${SHADOW[s.size]}" />`).join('\n')}
        >
          {STEPS.map((s) => (
            <Tile key={s.size} cls={SHADOW[s.size]} name={SHADOW[s.size]} value="stacked, no ring" use={s.use} />
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="In flow and floating"
        description="The same panel twice. On the page it is flat with a border. Over the page it takes shadow-ring-md and drops the border, so there is one edge, never two."
      >
        <Example
          previewClassName="bg-muted grid grid-cols-1 gap-6 p-6 sm:grid-cols-2"
          code={`<div className="bg-background border-border rounded-md border p-4 text-sm">In page flow</div>
<div className="bg-popover shadow-ring-md rounded-lg p-4 text-sm">Floating</div>`}
        >
          <div className="bg-background border-border rounded-md border p-4 text-sm">In page flow</div>
          <div className="bg-popover shadow-ring-md rounded-lg p-4 text-sm">Floating</div>
        </Example>
      </DocSection>
    </DocPage>
  );
}
