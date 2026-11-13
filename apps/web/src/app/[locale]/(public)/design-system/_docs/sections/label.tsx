'use client';

import { Checkbox } from '@kortix/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@kortix/ui/field';
import { Input } from '@kortix/ui/input';
import { Label } from '@kortix/ui/label';
import { Switch } from '@kortix/ui/switch';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function LabelPage() {
  const [alerts, setAlerts] = useState(true);

  return (
    <DocPage
      title="Label"
      lead="The name of a control: 14px, medium, muted. A click on it focuses or toggles its control. Field arranges a label, a control and a description into one block."
    >
      <DocSection title="Label" description="Connect it to the control with htmlFor and the control's id.">
        <Example
          code={`<div className="flex w-full max-w-xs flex-col gap-2">
  <Label htmlFor="label-name">Display name</Label>
  <Input id="label-name" placeholder="Ada Lovelace" />
</div>
<div className="flex items-center gap-2">
  <Checkbox id="label-terms" />
  <Label htmlFor="label-terms">Accept the terms</Label>
</div>`}
        >
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Label htmlFor="label-name">Display name</Label>
            <Input id="label-name" placeholder="Ada Lovelace" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="label-terms" />
            <Label htmlFor="label-terms">Accept the terms</Label>
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Field"
        description="Field stacks FieldLabel, the control and FieldDescription with a 12px gap. FieldGroup spaces several fields."
      >
        <Example
          code={`<FieldGroup className="max-w-sm">
  <Field>
    <FieldLabel htmlFor="field-project">Project name</FieldLabel>
    <Input id="field-project" placeholder="Website redesign" />
    <FieldDescription>Shown in the sidebar and in every invite.</FieldDescription>
  </Field>
  <Field>
    <FieldLabel htmlFor="field-repo">Repository</FieldLabel>
    <Input id="field-repo" placeholder="org/repo" />
  </Field>
</FieldGroup>`}
        >
          <FieldGroup className="max-w-sm">
            <Field>
              <FieldLabel htmlFor="field-project">Project name</FieldLabel>
              <Input id="field-project" placeholder="Website redesign" />
              <FieldDescription>Shown in the sidebar and in every invite.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="field-repo">Repository</FieldLabel>
              <Input id="field-repo" placeholder="org/repo" />
            </Field>
          </FieldGroup>
        </Example>
      </DocSection>

      <DocSection
        title="Horizontal"
        description='orientation="horizontal" puts the control beside its text. FieldContent holds the label and the description.'
      >
        <Example
          code={`const [alerts, setAlerts] = useState(true);

<Field orientation="horizontal" className="max-w-sm">
  <FieldContent>
    <FieldLabel htmlFor="field-alerts">Email alerts</FieldLabel>
    <FieldDescription>Get an email when a session fails.</FieldDescription>
  </FieldContent>
  <Switch id="field-alerts" checked={alerts} onCheckedChange={setAlerts} />
</Field>`}
        >
          <Field orientation="horizontal" className="max-w-sm">
            <FieldContent>
              <FieldLabel htmlFor="field-alerts">Email alerts</FieldLabel>
              <FieldDescription>Get an email when a session fails.</FieldDescription>
            </FieldContent>
            <Switch id="field-alerts" checked={alerts} onCheckedChange={setAlerts} />
          </Field>
        </Example>
      </DocSection>

      <DocSection
        title="Error"
        description='data-invalid="true" on the Field turns its text destructive. Set aria-invalid on the control as well, so the field draws its error ring.'
      >
        <Example
          code={`<Field data-invalid="true" className="max-w-sm">
  <FieldLabel htmlFor="field-domain">Domain</FieldLabel>
  <Input id="field-domain" defaultValue="acme" aria-invalid aria-describedby="field-domain-error" />
  <FieldDescription id="field-domain-error" className="text-destructive">
    Enter a full domain, for example acme.com.
  </FieldDescription>
</Field>`}
        >
          <Field data-invalid="true" className="max-w-sm">
            <FieldLabel htmlFor="field-domain">Domain</FieldLabel>
            <Input id="field-domain" defaultValue="acme" aria-invalid aria-describedby="field-domain-error" />
            <FieldDescription id="field-domain-error" className="text-destructive">
              Enter a full domain, for example acme.com.
            </FieldDescription>
          </Field>
        </Example>
      </DocSection>

      <DocSection title="Disabled" description='data-disabled="true" on the Field fades its label to 50%.'>
        <Example
          code={`<Field data-disabled="true" className="max-w-sm">
  <FieldLabel htmlFor="field-region">Region</FieldLabel>
  <Input id="field-region" defaultValue="eu-central-1" disabled />
  <FieldDescription>Set when the project was created.</FieldDescription>
</Field>`}
        >
          <Field data-disabled="true" className="max-w-sm">
            <FieldLabel htmlFor="field-region">Region</FieldLabel>
            <Input id="field-region" defaultValue="eu-central-1" disabled />
            <FieldDescription>Set when the project was created.</FieldDescription>
          </Field>
        </Example>
      </DocSection>
    </DocPage>
  );
}
