'use client';

import { CardSurface } from '@kortix/ui/card-surface';

import { DocPage, DocSection, Example } from '../doc';

const SURFACES = [
  ['strong', 'Strong', 'The panel fill. The default.'],
  ['subtle', 'Subtle', 'A washed lift, for a quiet group.'],
  ['container', 'Container', 'An inset well that holds other surfaces.'],
] as const;

const RADII = [
  ['md', 'Medium', '8px'],
  ['lg', 'Large', '10px'],
  ['xl', 'Extra Large', '14px'],
] as const;

function Body({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-4">
      <span className="text-sm font-medium">{title}</span>
      <span className="text-muted-foreground text-xs">{meta}</span>
    </div>
  );
}

export default function CardPage() {
  return (
    <DocPage
      title="Card"
      lead="A plain surface that holds content in page flow: a form, a settings group, a code sample. For a clickable tile in a list, use Card from @kortix/ui/card instead."
    >
      <DocSection title="Surfaces">
        <Example
          previewClassName="grid grid-cols-1 gap-3 sm:grid-cols-3"
          code={SURFACES.map(([s, name]) => `<CardSurface surface="${s}">${name}</CardSurface>`).join('\n')}
        >
          {SURFACES.map(([s, name, meta]) => (
            <CardSurface key={s} surface={s}>
              <Body title={name} meta={meta} />
            </CardSurface>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Radius" description="xl is the default. Match the radius to the size of the surface: small surfaces take the smaller corners.">
        <Example
          previewClassName="grid grid-cols-1 gap-3 sm:grid-cols-3"
          code={RADII.map(([r, name]) => `<CardSurface radius="${r}">${name}</CardSurface>`).join('\n')}
        >
          {RADII.map(([r, name, px]) => (
            <CardSurface key={r} radius={r}>
              <Body title={name} meta={px} />
            </CardSurface>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Elevation" description="In page flow a surface is flat: a hairline, no shadow. Elevated adds shadow-xs for a surface that sits above its neighbours.">
        <Example
          previewClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
          code={`<CardSurface elevation="elevated">Elevated</CardSurface>\n<CardSurface elevation="flat">Flat</CardSurface>`}
        >
          <CardSurface elevation="elevated">
            <Body title="Elevated" meta="shadow-xs + hairline" />
          </CardSurface>
          <CardSurface elevation="flat">
            <Body title="Flat" meta="hairline only" />
          </CardSurface>
        </Example>
      </DocSection>

      <DocSection title="Divided" description="A hairline between rows, for a settings group or a short list.">
        <Example
          code={`<CardSurface divided>
  <div className="p-4">First row</div>
  <div className="p-4">Second row</div>
  <div className="p-4">Third row</div>
</CardSurface>`}
        >
          <CardSurface divided className="w-full">
            {['First row', 'Second row', 'Third row'].map((row) => (
              <div key={row} className="p-4 text-sm">
                {row}
              </div>
            ))}
          </CardSurface>
        </Example>
      </DocSection>
    </DocPage>
  );
}
