'use client';

import { Button } from '@kortix/ui/button';
import { Input } from '@kortix/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@kortix/ui/input-group';
import { Kbd, KbdGroup } from '@kortix/ui/kbd';
import { Label } from '@kortix/ui/label';
import { ArrowUpIcon, AtIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

const SIZES = ['sm', 'md', 'lg', 'xl'] as const;
const SIZE_LABEL = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra Large' } as const;

export default function InputPage() {
  return (
    <DocPage
      title="Input"
      lead="One field surface: a popover fill, a 1px border and the md radius. Focus draws the ring token twice, a solid border plus a 3px halo. lg is the default, so a field sits level with a lg Button."
    >
      <DocSection title="Default">
        <Example code={`<Input placeholder="Project name" aria-label="Project name" className="max-w-xs" />`}>
          <Input placeholder="Project name" aria-label="Project name" className="max-w-xs" />
        </Example>
      </DocSection>

      <DocSection
        title="Sizes"
        description="The control ladder: a field is as tall as a Button or Select of the same size. sm and md set 13px text, lg and xl 14px."
      >
        <Example
          previewClassName="flex-col items-stretch gap-3"
          code={SIZES.map(
            (s) => `<div className="flex max-w-sm items-center gap-2">
  <Input size="${s}" placeholder="${SIZE_LABEL[s]}" aria-label="${SIZE_LABEL[s]}" />
  <Button variant="secondary" size="${s}">Save</Button>
</div>`,
          ).join('\n')}
        >
          {SIZES.map((s) => (
            <div key={s} className="flex max-w-sm items-center gap-2">
              <Input size={s} placeholder={SIZE_LABEL[s]} aria-label={SIZE_LABEL[s]} />
              <Button variant="secondary" size={s}>
                Save
              </Button>
            </div>
          ))}
        </Example>
      </DocSection>

      <DocSection title="With a label" description="Point the Label at the field with htmlFor, so a click on the label focuses the field.">
        <Example
          code={`<div className="flex w-full max-w-xs flex-col gap-2">
  <Label htmlFor="input-email">Email</Label>
  <Input id="input-email" type="email" placeholder="name@company.com" />
</div>`}
        >
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Label htmlFor="input-email">Email</Label>
            <Input id="input-email" type="email" placeholder="name@company.com" />
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Invalid"
        description="Set aria-invalid. The border and halo turn destructive and the field shakes once. Put the reason in one sentence under the field."
      >
        <Example
          code={`<div className="flex w-full max-w-xs flex-col gap-2">
  <Label htmlFor="input-slug">Slug</Label>
  <Input
    id="input-slug"
    defaultValue="My Project"
    aria-invalid
    aria-describedby="input-slug-error"
  />
  <p id="input-slug-error" className="text-destructive text-xs">
    Use lowercase letters, numbers and dashes.
  </p>
</div>`}
        >
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Label htmlFor="input-slug">Slug</Label>
            <Input id="input-slug" defaultValue="My Project" aria-invalid aria-describedby="input-slug-error" />
            <p id="input-slug-error" className="text-destructive text-xs">
              Use lowercase letters, numbers and dashes.
            </p>
          </div>
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example
          code={`<Input disabled placeholder="Disabled" aria-label="Disabled" className="max-w-xs" />
<Input disabled defaultValue="kortix-production" aria-label="Disabled with value" className="max-w-xs" />`}
          previewClassName="flex-col items-stretch gap-3"
        >
          <Input disabled placeholder="Disabled" aria-label="Disabled" className="max-w-xs" />
          <Input disabled defaultValue="kortix-production" aria-label="Disabled with value" className="max-w-xs" />
        </Example>
      </DocSection>

      <DocSection
        title="Input group"
        description="InputGroup draws the field surface once and holds addons inside it: an icon, a fixed prefix, a key hint or a button. The focus ring wraps the whole group."
      >
        <Example
          previewClassName="flex-col items-stretch gap-3"
          code={`<InputGroup className="max-w-sm">
  <InputGroupAddon>
    <MagnifyingGlassIcon />
  </InputGroupAddon>
  <InputGroupInput placeholder="Search sessions" aria-label="Search sessions" />
  <InputGroupAddon align="inline-end">
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  </InputGroupAddon>
</InputGroup>

<InputGroup className="max-w-sm">
  <InputGroupAddon>https://</InputGroupAddon>
  <InputGroupInput placeholder="acme" aria-label="Subdomain" />
  <InputGroupAddon align="inline-end">.kortix.app</InputGroupAddon>
</InputGroup>

<InputGroup className="max-w-sm">
  <InputGroupAddon>
    <AtIcon />
  </InputGroupAddon>
  <InputGroupInput placeholder="Invite by email" aria-label="Invite by email" />
  <InputGroupAddon align="inline-end">
    <InputGroupButton size="icon-xs" variant="default" aria-label="Send invite">
      <ArrowUpIcon />
    </InputGroupButton>
  </InputGroupAddon>
</InputGroup>`}
        >
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search sessions" aria-label="Search sessions" />
            <InputGroupAddon align="inline-end">
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </InputGroupAddon>
          </InputGroup>

          <InputGroup className="max-w-sm">
            <InputGroupAddon>https://</InputGroupAddon>
            <InputGroupInput placeholder="acme" aria-label="Subdomain" />
            <InputGroupAddon align="inline-end">.kortix.app</InputGroupAddon>
          </InputGroup>

          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <AtIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Invite by email" aria-label="Invite by email" />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" variant="default" aria-label="Send invite">
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Example>
      </DocSection>
    </DocPage>
  );
}
