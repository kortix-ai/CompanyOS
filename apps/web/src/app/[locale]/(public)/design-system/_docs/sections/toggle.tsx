'use client';

import { Toggle } from '@kortix/ui/toggle';
import {
  PushPinIcon,
  StarIcon,
  TextBIcon,
  TextItalicIcon,
  TextUnderlineIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const SIZES = [
  ['sm', 'Small'],
  ['default', 'Default'],
  ['lg', 'Large'],
] as const;

export default function TogglePage() {
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  return (
    <DocPage
      title="Toggle"
      lead="A button that stays pressed. Off is transparent and muted; on is a 10% primary fill with primary ink. Use it for a view or format option; use a Switch for a setting."
    >
      <DocSection title="Default" description="Control it with pressed and onPressedChange, or leave it uncontrolled with defaultPressed.">
        <Example
          code={`<Toggle defaultPressed iconOnly aria-label="Pin">
  <PushPinIcon />
</Toggle>
<Toggle iconOnly aria-label="Star">
  <StarIcon />
</Toggle>
<Toggle defaultPressed>
  <StarIcon />
  Starred
</Toggle>`}
        >
          <Toggle defaultPressed iconOnly aria-label="Pin">
            <PushPinIcon />
          </Toggle>
          <Toggle iconOnly aria-label="Star">
            <StarIcon />
          </Toggle>
          <Toggle defaultPressed>
            <StarIcon />
            Starred
          </Toggle>
        </Example>
      </DocSection>

      <DocSection title="Variants" description="default, outline and secondary.">
        <Example
          code={`<Toggle defaultPressed iconOnly aria-label="Bold">
  <TextBIcon />
</Toggle>
<Toggle variant="outline" defaultPressed iconOnly aria-label="Bold">
  <TextBIcon />
</Toggle>
<Toggle variant="secondary" iconOnly aria-label="Bold">
  <TextBIcon />
</Toggle>`}
        >
          <Toggle defaultPressed iconOnly aria-label="Bold">
            <TextBIcon />
          </Toggle>
          <Toggle variant="outline" defaultPressed iconOnly aria-label="Bold">
            <TextBIcon />
          </Toggle>
          <Toggle variant="secondary" iconOnly aria-label="Bold">
            <TextBIcon />
          </Toggle>
        </Example>
      </DocSection>

      <DocSection title="Sizes" description="Toggle has its own three sizes: sm, default and lg. It is not on the control ladder.">
        <Example
          code={SIZES.map(([s, label]) => `<Toggle size="${s}" variant="outline">${label}</Toggle>`).join('\n')}
        >
          {SIZES.map(([s, label]) => (
            <Toggle key={s} size={s} variant="outline">
              {label}
            </Toggle>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Toolbar"
        description="Independent toggles side by side. Each one keeps its own state."
      >
        <Example
          code={`const [bold, setBold] = useState(true);
const [italic, setItalic] = useState(false);
const [underline, setUnderline] = useState(false);

<div role="toolbar" aria-label="Text format" className="flex items-center gap-1">
  <Toggle size="sm" pressed={bold} onPressedChange={setBold} iconOnly aria-label="Bold">
    <TextBIcon />
  </Toggle>
  <Toggle size="sm" pressed={italic} onPressedChange={setItalic} iconOnly aria-label="Italic">
    <TextItalicIcon />
  </Toggle>
  <Toggle size="sm" pressed={underline} onPressedChange={setUnderline} iconOnly aria-label="Underline">
    <TextUnderlineIcon />
  </Toggle>
</div>`}
        >
          <div role="toolbar" aria-label="Text format" className="flex items-center gap-1">
            <Toggle size="sm" pressed={bold} onPressedChange={setBold} iconOnly aria-label="Bold">
              <TextBIcon />
            </Toggle>
            <Toggle size="sm" pressed={italic} onPressedChange={setItalic} iconOnly aria-label="Italic">
              <TextItalicIcon />
            </Toggle>
            <Toggle size="sm" pressed={underline} onPressedChange={setUnderline} iconOnly aria-label="Underline">
              <TextUnderlineIcon />
            </Toggle>
          </div>
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example
          code={`<Toggle disabled iconOnly aria-label="Disabled">
  <TextBIcon />
</Toggle>
<Toggle disabled defaultPressed iconOnly aria-label="Disabled pressed">
  <TextBIcon />
</Toggle>`}
        >
          <Toggle disabled iconOnly aria-label="Disabled">
            <TextBIcon />
          </Toggle>
          <Toggle disabled defaultPressed iconOnly aria-label="Disabled pressed">
            <TextBIcon />
          </Toggle>
        </Example>
      </DocSection>
    </DocPage>
  );
}
