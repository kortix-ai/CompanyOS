'use client';

import { Label } from '@kortix/ui/label';
import { Switch } from '@kortix/ui/switch';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function SwitchPage() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [sync, setSync] = useState(true);
  const [beta, setBeta] = useState(false);

  return (
    <DocPage
      title="Switch"
      lead="A setting that takes effect at once. The track is 34 by 20px; the thumb stretches on hover and press, follows a drag, and settles on a spring. Use a Checkbox when the change waits for a Save."
    >
      <DocSection title="On and off" description="Control it: pass checked and onCheckedChange.">
        <Example
          code={`const [on, setOn] = useState(true);
const [off, setOff] = useState(false);

<Switch checked={on} onCheckedChange={setOn} aria-label="On" />
<Switch checked={off} onCheckedChange={setOff} aria-label="Off" />`}
        >
          <Switch checked={on} onCheckedChange={setOn} aria-label="On" />
          <Switch checked={off} onCheckedChange={setOff} aria-label="Off" />
        </Example>
      </DocSection>

      <DocSection
        title="With a label"
        description="The label prop renders the text beside the track. It reads as foreground while on and muted while off."
      >
        <Example
          code={`const [sync, setSync] = useState(true);
const [beta, setBeta] = useState(false);

<Switch label="Sync files" checked={sync} onCheckedChange={setSync} />
<Switch label="Beta features" checked={beta} onCheckedChange={setBeta} />`}
        >
          <Switch label="Sync files" checked={sync} onCheckedChange={setSync} />
          <Switch label="Beta features" checked={beta} onCheckedChange={setBeta} />
        </Example>
      </DocSection>

      <DocSection
        title="In a settings row"
        description="A row puts the name on the left and the switch on the trailing edge. Point a Label at the switch's id."
      >
        <Example
          code={`<div className="flex w-full max-w-sm items-center justify-between gap-3">
  <Label htmlFor="switch-sync">Sync files</Label>
  <Switch id="switch-sync" checked={sync} onCheckedChange={setSync} />
</div>`}
        >
          <div className="flex w-full max-w-sm items-center justify-between gap-3">
            <Label htmlFor="switch-sync">Sync files</Label>
            <Switch id="switch-sync" checked={sync} onCheckedChange={setSync} />
          </div>
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example
          code={`<Switch disabled aria-label="Disabled off" />
<Switch disabled checked aria-label="Disabled on" />
<Switch disabled checked label="Managed by your admin" />`}
        >
          <Switch disabled aria-label="Disabled off" />
          <Switch disabled checked aria-label="Disabled on" />
          <Switch disabled checked label="Managed by your admin" />
        </Example>
      </DocSection>
    </DocPage>
  );
}
