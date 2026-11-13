'use client';

import { Checkbox } from '@kortix/ui/checkbox';
import { CheckboxGroup, CheckboxGroupItem } from '@kortix/ui/checkbox-group';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function CheckboxPage() {
  const [checked, setChecked] = useState(true);
  const [channels, setChannels] = useState<string[]>(['email']);

  return (
    <DocPage
      title="Checkbox"
      lead="A 14px box with 4px corners and a 1.5px rule. The tap target is 30px: an invisible 8px ring around the box. It presses to 96% like a button."
    >
      <DocSection title="Default">
        <Example
          code={`<Checkbox aria-label="Unchecked" />
<Checkbox checked={checked} onCheckedChange={setChecked} aria-label="Checked" />
<Checkbox label="With a label" />`}
        >
          <Checkbox aria-label="Unchecked" />
          <Checkbox checked={checked} onCheckedChange={setChecked} aria-label="Checked" />
          <div className="w-56">
            <Checkbox label="With a label" />
          </div>
        </Example>
      </DocSection>

      <DocSection title="Indeterminate" description="The mixed state: some, not all, of the rows it controls are selected. Set it from the rows; a click makes it checked.">
        <Example code={`<Checkbox checked="indeterminate" aria-label="Indeterminate" />`}>
          <Checkbox checked="indeterminate" aria-label="Indeterminate" />
        </Example>
      </DocSection>

      <DocSection title="Ink" description="Blue is the default. Black is the foreground ink and inverts in dark mode.">
        <Example code={`<Checkbox defaultChecked aria-label="Blue" />\n<Checkbox variant="black" defaultChecked aria-label="Black" />`}>
          <Checkbox defaultChecked aria-label="Blue" />
          <Checkbox variant="black" defaultChecked aria-label="Black" />
        </Example>
      </DocSection>

      <DocSection title="Group" description="Several independent choices under one label. The group holds the selected values as an array.">
        <Example
          previewClassName="block p-4"
          code={`const [channels, setChannels] = useState(['email']);

<CheckboxGroup value={channels} onValueChange={setChannels} className="w-64">
  <CheckboxGroupItem value="email" label="Email" />
  <CheckboxGroupItem value="slack" label="Slack" />
  <CheckboxGroupItem value="sms" label="Text message" />
</CheckboxGroup>`}
        >
          <CheckboxGroup value={channels} onValueChange={setChannels} className="w-64">
            <CheckboxGroupItem value="email" label="Email" />
            <CheckboxGroupItem value="slack" label="Slack" />
            <CheckboxGroupItem value="sms" label="Text message" />
          </CheckboxGroup>
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example
          code={`<Checkbox disabled aria-label="Disabled" />
<Checkbox disabled defaultChecked aria-label="Disabled checked" />
<Checkbox disabled checked="indeterminate" aria-label="Disabled indeterminate" />`}
        >
          <Checkbox disabled aria-label="Disabled" />
          <Checkbox disabled defaultChecked aria-label="Disabled checked" />
          <Checkbox disabled checked="indeterminate" aria-label="Disabled indeterminate" />
        </Example>
      </DocSection>
    </DocPage>
  );
}
