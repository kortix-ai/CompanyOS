'use client';

import { Button } from '@kortix/ui/button';
import { ArrowRightIcon, PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';
import { useControlSizes } from '../control-sizes';

const VARIANTS = [
  ['default', 'Primary'],
  ['secondary', 'Secondary'],
  ['outline', 'Outline'],
  ['ghost', 'Ghost'],
  ['brand', 'Brand'],
  ['danger', 'Danger'],
] as const;

const SIZES = ['sm', 'md', 'lg', 'xl'] as const;
const SIZE_LABEL = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra Large' } as const;

export default function ButtonPage() {
  const [pending, setPending] = useState(false);

  return (
    <DocPage
      title="Button"
      lead="One component, six variants, four sizes. Every size reads its height, padding, gap, icon and radius from the control ladder, so a Button, a Tab and a Select of the same size line up."
    >
      <DocSection title="Variants">
        <Example
          code={VARIANTS.map(([v, label]) => `<Button variant="${v}">${label}</Button>`).join('\n')}
        >
          {VARIANTS.map(([v, label]) => (
            <Button key={v} variant={v}>
              {label}
            </Button>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Sizes"
        description="md is the default. sm for row actions and toolbars, lg for primary page actions, xl for marketing and empty states."
      >
        <Example
          previewClassName="flex-col items-start gap-4"
          code={SIZES.map((s) => `<Button size="${s}">${SIZE_LABEL[s]}</Button>`).join('\n')}
        >
          {SIZES.map((s) => (
            <div key={s} className="flex flex-wrap items-center gap-3">
              {VARIANTS.map(([v]) => (
                <Button key={v} variant={v} size={s}>
                  {SIZE_LABEL[s]}
                </Button>
              ))}
            </div>
          ))}
        </Example>
        <SizeSpec />
      </DocSection>

      <DocSection
        title="With icon"
        description="The side that holds an icon sits closer to the edge: 4px at md and xl, 2px at sm and lg."
      >
        <Example
          code={`<Button>
  <PlusIcon />
  Leading icon
</Button>
<Button>
  Trailing icon
  <ArrowRightIcon />
</Button>
<Button variant="secondary">
  <PlusIcon />
  Secondary
</Button>
<Button variant="brand">
  Brand
  <ArrowRightIcon />
</Button>`}
        >
          <Button>
            <PlusIcon />
            Leading icon
          </Button>
          <Button>
            Trailing icon
            <ArrowRightIcon />
          </Button>
          <Button variant="secondary">
            <PlusIcon />
            Secondary
          </Button>
          <Button variant="brand">
            Brand
            <ArrowRightIcon />
          </Button>
        </Example>
      </DocSection>

      <DocSection title="Icon only" description="Square: the width equals the height. Always give it an aria-label.">
        <Example
          code={SIZES.map(
            (s) => `<Button variant="secondary" size="${s}" iconOnly aria-label="Add">\n  <PlusIcon />\n</Button>`,
          ).join('\n')}
        >
          {SIZES.map((s) => (
            <Button key={s} variant="secondary" size={s} iconOnly aria-label="Add">
              <PlusIcon />
            </Button>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Shapes">
        <Example code={`<Button shape="rounded">Rounded</Button>\n<Button shape="pill">Pill</Button>`} /* audit:allow prop value, not the legacy class */>
          <Button shape="rounded" /* audit:allow prop value */>Rounded</Button>
          <Button shape="pill">Pill</Button>
          <Button shape="pill" variant="secondary" iconOnly aria-label="Add">
            <PlusIcon />
          </Button>
        </Example>
      </DocSection>

      <DocSection
        title="Pending"
        description="The label hides and the width holds, so nothing around the button moves. Clicks stop while it is pending."
      >
        <Example
          code={`${SIZES.map((s) => `<Button size="${s}" pending>${SIZE_LABEL[s]}</Button>`).join('\n')}

const [pending, setPending] = useState(false);
<Button variant="secondary" pending={pending} onClick={save}>Save</Button>`}
        >
          {SIZES.map((s) => (
            <Button key={s} size={s} pending>
              {SIZE_LABEL[s]}
            </Button>
          ))}
          <Button
            variant="secondary"
            pending={pending}
            onClick={() => {
              setPending(true);
              window.setTimeout(() => setPending(false), 1500);
            }}
          >
            Click to save
          </Button>
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example
          code={`<Button disabled>Disabled primary</Button>
<Button variant="secondary" disabled>Disabled secondary</Button>
<Button variant="brand" disabled>Disabled brand</Button>`}
        >
          <Button disabled>Disabled primary</Button>
          <Button variant="secondary" disabled>
            Disabled secondary
          </Button>
          <Button variant="brand" disabled>
            Disabled brand
          </Button>
        </Example>
      </DocSection>
    </DocPage>
  );
}

function SizeSpec() {
  const sizes = useControlSizes();
  return (
    <div tabIndex={0} role="region" aria-label="Button sizes" className="border-border overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr className="border-border border-b">
            {['Size', 'Height', 'Padding', 'Icon side', 'Gap', 'Icon', 'Radius', 'Text'].map((h) => (
              <th key={h} className="px-3 py-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-xs tabular-nums">
          {sizes.filter((s) => (SIZES as readonly string[]).includes(s.size)).map((s) => (
            <tr key={s.size} className="border-border border-b last:border-b-0">
              <td className="px-3 py-2 font-sans text-sm font-medium">{s.size}</td>
              <td className="px-3 py-2">{s.height}px</td>
              <td className="px-3 py-2">{s.padding}px</td>
              <td className="px-3 py-2">{s.paddingIcon}px</td>
              <td className="px-3 py-2">{s.gap}px</td>
              <td className="px-3 py-2">{s.icon}px</td>
              <td className="px-3 py-2">{s.radius}px</td>
              <td className="px-3 py-2">13px</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
