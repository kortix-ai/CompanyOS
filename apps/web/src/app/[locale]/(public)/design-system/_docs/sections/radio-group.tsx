'use client';

import { Label } from '@kortix/ui/label';
import { RadioGroup, RadioGroupItem } from '@kortix/ui/radio-group';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const SIZES = ['sm', 'md', 'lg'] as const;

export default function RadioGroupPage() {
  const [plan, setPlan] = useState('pro');

  return (
    <DocPage
      title="Radio Group"
      lead="Pick exactly one of a few visible options. The selected dot is a 4px blue ring. Arrow keys move the choice and wrap at the ends. For more than five options, use a Select."
    >
      <DocSection title="With labels" description="Each item takes a label; the whole row is the hit area.">
        <Example
          code={`<RadioGroup defaultValue="comfortable" className="w-56">
  <RadioGroupItem value="default" label="Default" />
  <RadioGroupItem value="comfortable" label="Comfortable" />
  <RadioGroupItem value="compact" label="Compact" />
</RadioGroup>`}
        >
          <RadioGroup defaultValue="comfortable" className="w-56">
            <RadioGroupItem value="default" label="Default" />
            <RadioGroupItem value="comfortable" label="Comfortable" />
            <RadioGroupItem value="compact" label="Compact" />
          </RadioGroup>
        </Example>
      </DocSection>

      <DocSection title="With descriptions" description="A description sits under the label in muted 13px text.">
        <Example
          code={`const [plan, setPlan] = useState('pro');

<RadioGroup value={plan} onValueChange={setPlan} className="w-72">
  <RadioGroupItem value="hobby" label="Hobby" description="For personal projects." />
  <RadioGroupItem value="pro" label="Pro" description="For professionals." />
  <RadioGroupItem value="team" label="Team" description="For small teams." />
</RadioGroup>`}
        >
          <RadioGroup value={plan} onValueChange={setPlan} className="w-72">
            <RadioGroupItem value="hobby" label="Hobby" description="For personal projects." />
            <RadioGroupItem value="pro" label="Pro" description="For professionals." />
            <RadioGroupItem value="team" label="Team" description="For small teams." />
          </RadioGroup>
        </Example>
      </DocSection>

      <DocSection
        title="Sizes"
        description="size sets the row padding: sm, md (default) or lg. The dot stays 16px."
      >
        <Example
          previewClassName="items-start gap-6"
          code={SIZES.map(
            (s) => `<RadioGroup defaultValue="a" className="w-40">
  <RadioGroupItem size="${s}" value="a" label="Option A" />
  <RadioGroupItem size="${s}" value="b" label="Option B" />
</RadioGroup>`,
          ).join('\n')}
        >
          {SIZES.map((s) => (
            <RadioGroup key={s} defaultValue="a" className="w-40">
              <RadioGroupItem size={s} value="a" label="Option A" />
              <RadioGroupItem size={s} value="b" label="Option B" />
            </RadioGroup>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Outline" description='variant="outline" draws a border around each row, for a list of cards.'>
        <Example
          code={`<RadioGroup defaultValue="eu" className="w-72 gap-2">
  <RadioGroupItem variant="outline" value="us" label="United States" description="us-east-1" />
  <RadioGroupItem variant="outline" value="eu" label="Europe" description="eu-central-1" />
</RadioGroup>`}
        >
          <RadioGroup defaultValue="eu" className="w-72 gap-2">
            <RadioGroupItem variant="outline" value="us" label="United States" description="us-east-1" />
            <RadioGroupItem variant="outline" value="eu" label="Europe" description="eu-central-1" />
          </RadioGroup>
        </Example>
      </DocSection>

      <DocSection
        title="Bare items"
        description="Without a label prop the item is the dot alone. Pair it with a Label through id and htmlFor."
      >
        <Example
          code={`<RadioGroup defaultValue="light" orientation="horizontal" className="flex gap-4">
  <div className="flex items-center gap-2">
    <RadioGroupItem id="radio-light" value="light" />
    <Label htmlFor="radio-light">Light</Label>
  </div>
  <div className="flex items-center gap-2">
    <RadioGroupItem id="radio-dark" value="dark" />
    <Label htmlFor="radio-dark">Dark</Label>
  </div>
</RadioGroup>`}
        >
          <RadioGroup defaultValue="light" orientation="horizontal" className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem id="radio-light" value="light" />
              <Label htmlFor="radio-light">Light</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="radio-dark" value="dark" />
              <Label htmlFor="radio-dark">Dark</Label>
            </div>
          </RadioGroup>
        </Example>
      </DocSection>

      <DocSection title="Disabled" description="Disable one item, or the whole group.">
        <Example
          code={`<RadioGroup defaultValue="a" className="w-56">
  <RadioGroupItem value="a" label="Available" />
  <RadioGroupItem value="b" label="Not on your plan" disabled />
</RadioGroup>`}
        >
          <RadioGroup defaultValue="a" className="w-56">
            <RadioGroupItem value="a" label="Available" />
            <RadioGroupItem value="b" label="Not on your plan" disabled />
          </RadioGroup>
        </Example>
      </DocSection>
    </DocPage>
  );
}
