'use client';

import { Calendar } from '@kortix/ui/calendar';
import { DateRangePicker, resolvePreset, type CostRange } from '@kortix/ui/date-range-picker';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { DocPage, DocSection, Example } from '../doc';

export default function CalendarPage() {
  const [day, setDay] = useState<Date | undefined>(() => new Date());
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = new Date();
    return { from, to: new Date(from.getTime() + 4 * 86_400_000) };
  });
  const [costRange, setCostRange] = useState<CostRange>(() => resolvePreset('7d', new Date()));

  return (
    <DocPage
      title="Calendar"
      lead="A month grid for picking a day or a range, and a range picker that pairs it with presets. Both read their buttons from Button, so a day cell hovers like a ghost button."
    >
      <DocSection title="Single day">
        <Example
          code={`<Calendar
  mode="single"
  selected={day}
  onSelect={setDay}
  className="border-border rounded-md border"
/>`}
        >
          <Calendar mode="single" selected={day} onSelect={setDay} className="border-border rounded-md border" />
        </Example>
      </DocSection>

      <DocSection
        title="Range"
        description="The first and last day take the primary fill; the days between take the accent fill."
      >
        <Example
          code={`<Calendar
  mode="range"
  selected={range}
  onSelect={setRange}
  className="border-border rounded-md border"
/>`}
        >
          <Calendar mode="range" selected={range} onSelect={setRange} className="border-border rounded-md border" />
        </Example>
      </DocSection>

      <DocSection
        title="Date range picker"
        description="A trigger over a popover with a preset rail beside a range calendar. Every path resolves to a half-open UTC window [from, to) before onChange. The trigger reserves the width of the widest label, so it does not jitter when the range changes."
      >
        <Example
          code={`const [value, setValue] = useState<CostRange>(() => resolvePreset('7d', new Date()));

<DateRangePicker value={value} onChange={setValue} />`}
        >
          <DateRangePicker value={costRange} onChange={setCostRange} />
        </Example>
      </DocSection>
    </DocPage>
  );
}
