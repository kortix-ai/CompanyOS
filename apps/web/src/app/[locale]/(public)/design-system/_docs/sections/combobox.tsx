'use client';

import { Combobox } from '@kortix/ui/combobox';

import { DocPage, DocSection, Example } from '../doc';

const TIMEZONES = [
  'Africa/Cairo',
  'America/Los_Angeles',
  'America/New_York',
  'America/Sao_Paulo',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Prague',
  'Pacific/Auckland',
].map((tz) => ({ value: tz, label: tz }));

const SIZES = ['sm', 'md', 'lg', 'xl'] as const;

export default function ComboboxPage() {
  return (
    <DocPage
      title="Combobox"
      lead="A select with a search field, for a long list a person scans by typing: timezones, countries, repositories. The panel scales from 95% and fades in over 200ms ease-in-out, out of the trigger it opened from, like every floating panel."
    >
      <DocSection title="Default">
        <Example
          code={`const TIMEZONES = [{ value: 'Europe/Prague', label: 'Europe/Prague' }, …];

<Combobox
  options={TIMEZONES}
  defaultValue="Europe/Prague"
  searchPlaceholder="Search timezones"
  aria-label="Timezone"
  className="w-56"
/>`}
        >
          <Combobox
            options={TIMEZONES}
            defaultValue="Europe/Prague"
            searchPlaceholder="Search timezones"
            aria-label="Timezone"
            className="w-56"
          />
        </Example>
      </DocSection>

      <DocSection title="Placeholder">
        <Example
          code={`<Combobox options={TIMEZONES} placeholder="Select a timezone" aria-label="Timezone" className="w-56" />`}
        >
          <Combobox options={TIMEZONES} placeholder="Select a timezone" aria-label="Timezone" className="w-56" />
        </Example>
      </DocSection>

      <DocSection title="Sizes" description="The trigger follows the control ladder, like Select.">
        <Example
          previewClassName="flex-col items-start gap-3"
          code={SIZES.map((s) => `<Combobox size="${s}" options={TIMEZONES} defaultValue="Asia/Tokyo" />`).join('\n')}
        >
          {SIZES.map((s) => (
            <Combobox key={s} size={s} options={TIMEZONES} defaultValue="Asia/Tokyo" aria-label={`Timezone ${s}`} className="w-56" />
          ))}
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example code={`<Combobox options={TIMEZONES} defaultValue="Asia/Tokyo" disabled aria-label="Timezone" />`}>
          <Combobox options={TIMEZONES} defaultValue="Asia/Tokyo" disabled aria-label="Timezone" className="w-56" />
        </Example>
      </DocSection>

      <DocSection
        title="Motion"
        description="Open: scale 0.95 → 1 and opacity 0 → 1, 200ms, ease-in-out, transform-origin at the trigger. Close: the same, reversed. Reduced motion: no transition. Rows highlight in 100ms. The same recipe opens menus, popovers and tooltips (D44)."
      >
        <Example
          language="css"
          code={`origin-(--transform-origin)
transition-[opacity,scale,translate] duration-moderate ease-in-out
data-starting-style:scale-95 data-starting-style:opacity-0
data-ending-style:scale-95 data-ending-style:opacity-0
motion-reduce:transition-none`}
        >
          <Combobox options={TIMEZONES} placeholder="Open me slowly" aria-label="Timezone" className="w-56" />
        </Example>
      </DocSection>
    </DocPage>
  );
}
