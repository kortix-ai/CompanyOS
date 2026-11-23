'use client';

import { Button } from '@kortix/ui/button';
import { Kbd, KbdGroup } from '@kortix/ui/kbd';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

const KEYS = ['⌘', '⇧', '⌥', '⌃', '↵', '⌫', '↑', '↓', 'K'];
const WORDS = ['Esc', 'Tab', 'Enter', 'Space'];

export default function KbdPage() {
  return (
    <DocPage
      title="Kbd"
      lead="A key: muted 13px text on a light chip, the same chip as a count beside a label. It is at least as wide as it is tall and grows to fit a word. Inside a tooltip it inverts."
    >
      <DocSection title="Single keys" description="One key per Kbd. A modifier or an arrow is its symbol.">
        <Example code={KEYS.map((k) => `<Kbd>${k}</Kbd>`).join('\n')}>
          {KEYS.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Word keys" description="A key with no symbol is its name. The chip grows to fit it.">
        <Example code={WORDS.map((k) => `<Kbd>${k}</Kbd>`).join('\n')}>
          {WORDS.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Combinations"
        description="KbdGroup holds one combination. It is a nested kbd, the HTML idiom for keys pressed together, and adds a 2px gap between the keys."
      >
        <Example
          code={`<KbdGroup>
  <Kbd>⌘</Kbd>
  <Kbd>K</Kbd>
</KbdGroup>
<KbdGroup>
  <Kbd>⇧</Kbd>
  <Kbd>⌘</Kbd>
  <Kbd>P</Kbd>
</KbdGroup>
<KbdGroup>
  <Kbd>⌘</Kbd>
  <Kbd>↵</Kbd>
</KbdGroup>`}
        >
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          <KbdGroup>
            <Kbd>⇧</Kbd>
            <Kbd>⌘</Kbd>
            <Kbd>P</Kbd>
          </KbdGroup>
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </KbdGroup>
        </Example>
      </DocSection>

      <DocSection title="In context" description="On a button, the shortcut sits after the label. In running text it names the key inline.">
        <Example
          code={`<Button variant="secondary">
  <MagnifyingGlassIcon />
  Search
  <KbdGroup>
    <Kbd>⌘</Kbd>
    <Kbd>K</Kbd>
  </KbdGroup>
</Button>
<p className="text-muted-foreground text-sm">
  Press <Kbd>↵</Kbd> to send and{' '}
  <KbdGroup>
    <Kbd>⇧</Kbd>
    <Kbd>↵</Kbd>
  </KbdGroup>{' '}
  for a new line.
</p>`}
        >
          <Button variant="secondary">
            <MagnifyingGlassIcon />
            Search
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
          <p className="text-muted-foreground text-sm">
            Press <Kbd>↵</Kbd> to send and{' '}
            <KbdGroup>
              <Kbd>⇧</Kbd>
              <Kbd>↵</Kbd>
            </KbdGroup>{' '}
            for a new line.
          </p>
        </Example>
      </DocSection>
    </DocPage>
  );
}
