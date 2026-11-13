'use client';

import { Button } from '@kortix/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette,
  CommandPaletteHints,
  CommandSeparator,
  CommandShortcut,
} from '@kortix/ui/command';
import { Kbd, KbdGroup } from '@kortix/ui/kbd';
import {
  CalendarBlankIcon,
  ChatCircleIcon,
  CreditCardIcon,
  FolderIcon,
  HouseIcon,
  MoonIcon,
  GearIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const PALETTE_GROUPS = [
  {
    heading: 'Suggestions',
    rows: [
      { icon: PlusIcon, label: 'New session', shortcut: '⌘J' },
      { icon: FolderIcon, label: 'Search files', shortcut: '⌘P' },
      { icon: CalendarBlankIcon, label: 'Schedule a trigger' },
    ],
  },
  {
    heading: 'Navigation',
    rows: [
      { icon: HouseIcon, label: 'Home' },
      { icon: ChatCircleIcon, label: 'Sessions' },
      { icon: UserIcon, label: 'Profile' },
      { icon: CreditCardIcon, label: 'Billing' },
    ],
  },
  {
    heading: 'Preferences',
    rows: [
      { icon: GearIcon, label: 'Settings', shortcut: '⌘,' },
      { icon: MoonIcon, label: 'Switch theme' },
    ],
  },
];

const PALETTE_CODE = `const [open, setOpen] = useState(false);
const [query, setQuery] = useState('');

<CommandPalette
  open={open}
  onOpenChange={setOpen}
  title="Command palette"
  placeholder="Search or run a command"
  value={query}
  onValueChange={setQuery}
  footer={<CommandPaletteHints navigateLabel="Navigate" selectLabel="Select" />}
>
  <CommandEmpty>No results</CommandEmpty>
  <CommandGroup heading="Suggestions">
    <CommandItem onSelect={() => setOpen(false)}>
      <PlusIcon className="size-4" />
      New session
      <CommandShortcut>⌘J</CommandShortcut>
    </CommandItem>
    …
  </CommandGroup>
</CommandPalette>`;

export default function CommandPage() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  return (
    <DocPage
      title="Command"
      lead="A search field over a filtered list of actions. Arrow keys move the highlight, Enter runs the row, and the pointer highlights on hover with no lag. Inline it in a panel, or open it as a palette."
    >
      <DocSection
        title="Inline"
        description="Type to filter. CommandEmpty shows when nothing matches. A disabled row stays visible and skips the keyboard."
      >
        <Example
          previewClassName="block"
          code={`<Command className="border-border max-w-md rounded-md border">
  <CommandInput
    placeholder="Search actions"
    leftElement={<MagnifyingGlassIcon className="text-muted-foreground size-4 shrink-0" />}
  />
  <CommandList>
    <CommandEmpty>No actions match.</CommandEmpty>
    <CommandGroup heading="Suggestions">
      <CommandItem>
        <ChatCircleIcon />
        New session
      </CommandItem>
      <CommandItem>
        <CalendarBlankIcon />
        Schedule a trigger
      </CommandItem>
      <CommandItem disabled>
        <PlusIcon />
        Add a repository
      </CommandItem>
    </CommandGroup>
    <CommandSeparator />
    <CommandGroup heading="Settings">
      <CommandItem>
        <UserIcon />
        Profile
        <CommandShortcut>⇧⌘P</CommandShortcut>
      </CommandItem>
      <CommandItem>
        <CreditCardIcon />
        Billing
        <CommandShortcut>⌘B</CommandShortcut>
      </CommandItem>
      <CommandItem>
        <GearIcon />
        Settings
        <CommandShortcut>⌘,</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`}
        >
          <Command className="border-border max-w-md rounded-md border">
            <CommandInput
              placeholder="Search actions"
              leftElement={<MagnifyingGlassIcon className="text-muted-foreground size-4 shrink-0" />}
            />
            <CommandList>
              <CommandEmpty>No actions match.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                <CommandItem>
                  <ChatCircleIcon />
                  New session
                </CommandItem>
                <CommandItem>
                  <CalendarBlankIcon />
                  Schedule a trigger
                </CommandItem>
                <CommandItem disabled>
                  <PlusIcon />
                  Add a repository
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Settings">
                <CommandItem>
                  <UserIcon />
                  Profile
                  <CommandShortcut>⇧⌘P</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  <CreditCardIcon />
                  Billing
                  <CommandShortcut>⌘B</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  <GearIcon />
                  Settings
                  <CommandShortcut>⌘,</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </Example>
      </DocSection>

      <DocSection
        title="Palette"
        description="CommandPalette is the ⌘K palette the workspace opens: pinned 17vh from the top at 600px so the input never moves while the list changes, a search glyph, a list that scrolls under a fade, and the ↑↓ / ↵ key hints. Use it for every palette; do not compose CommandDialog by hand."
      >
        <Example code={PALETTE_CODE}>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <MagnifyingGlassIcon />
            Open palette
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
          <CommandPalette
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setQuery('');
            }}
            title="Command palette"
            placeholder="Search or run a command"
            value={query}
            onValueChange={setQuery}
            footer={<CommandPaletteHints navigateLabel="Navigate" selectLabel="Select" />}
          >
            <CommandEmpty>No results</CommandEmpty>
            {PALETTE_GROUPS.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.rows.map((row) => (
                  <CommandItem key={row.label} onSelect={() => setOpen(false)}>
                    <row.icon className="size-4" />
                    {row.label}
                    {row.shortcut && <CommandShortcut>{row.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandPalette>
        </Example>
      </DocSection>
    </DocPage>
  );
}
