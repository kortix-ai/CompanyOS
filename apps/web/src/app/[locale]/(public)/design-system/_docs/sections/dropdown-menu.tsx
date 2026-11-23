'use client';

import { Button } from '@kortix/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@kortix/ui/dropdown-menu';
import {
  CaretDownIcon,
  DotsThreeIcon,
  EnvelopeIcon,
  GearIcon,
  KeyboardIcon,
  LinkIcon,
  TrashIcon,
  UserIcon,
  UserPlusIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const ROW_SIZES = ['sm', 'md', 'lg'] as const;
const ROW_LABEL = { sm: 'Small rows', md: 'Medium rows', lg: 'Large rows' } as const;

export default function DropdownMenuPage() {
  const [sidebar, setSidebar] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [theme, setTheme] = useState('system');

  return (
    <DocPage
      title="Dropdown Menu"
      lead="A list of actions anchored to a button. The panel is rounded-lg on the md shadow; rows are rounded-sm. It opens from its trigger, 0.95 to 1 and a fade in 200ms, and closes the same way. Every row type starts its label on the same x."
    >
      <DocSection
        title="Icons and shortcuts"
        description="A leading 16px glyph, the label, then the shortcut on the trailing edge."
      >
        <Example
          code={`<DropdownMenu>
  <DropdownMenuTrigger>
    <span>Account</span>
    <CaretDownIcon />
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="w-56">
    <DropdownMenuLabel>My account</DropdownMenuLabel>
    <DropdownMenuGroup>
      <DropdownMenuItem>
        <UserIcon />
        Profile
        <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem>
        <GearIcon />
        Settings
        <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem>
        <KeyboardIcon />
        Shortcuts
        <DropdownMenuShortcut>⌘/</DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuGroup>
  </DropdownMenuContent>
</DropdownMenu>`}
        >
          <DropdownMenu>
            <DropdownMenuTrigger>
              <span>Account</span>
              <CaretDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>My account</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <UserIcon />
                  Profile
                  <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <GearIcon />
                  Settings
                  <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <KeyboardIcon />
                  Shortcuts
                  <DropdownMenuShortcut>⌘/</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Example>
      </DocSection>

      <DocSection
        title="Checkbox and radio items"
        description="Checkbox rows toggle and keep the menu open. Radio rows pick one of a set; side='left' puts the dot in the icon slot."
      >
        <Example
          code={`const [sidebar, setSidebar] = useState(true);
const [minimap, setMinimap] = useState(false);
const [theme, setTheme] = useState('system');

<DropdownMenu>
  <DropdownMenuTrigger>
    <span>View</span>
    <CaretDownIcon />
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="w-56">
    <DropdownMenuLabel>Panels</DropdownMenuLabel>
    <DropdownMenuCheckboxItem checked={sidebar} onCheckedChange={setSidebar}>
      Sidebar
    </DropdownMenuCheckboxItem>
    <DropdownMenuCheckboxItem checked={minimap} onCheckedChange={setMinimap}>
      Minimap
    </DropdownMenuCheckboxItem>
    <DropdownMenuCheckboxItem checked disabled>
      Status bar
    </DropdownMenuCheckboxItem>
    <DropdownMenuSeparator />
    <DropdownMenuLabel>Theme</DropdownMenuLabel>
    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
      <DropdownMenuRadioItem side="left" value="light">Light</DropdownMenuRadioItem>
      <DropdownMenuRadioItem side="left" value="dark">Dark</DropdownMenuRadioItem>
      <DropdownMenuRadioItem side="left" value="system">System</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  </DropdownMenuContent>
</DropdownMenu>`}
        >
          <DropdownMenu>
            <DropdownMenuTrigger>
              <span>View</span>
              <CaretDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Panels</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={sidebar} onCheckedChange={setSidebar}>
                Sidebar
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={minimap} onCheckedChange={setMinimap}>
                Minimap
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked disabled>
                Status bar
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem side="left" value="light">
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem side="left" value="dark">
                  Dark
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem side="left" value="system">
                  System
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Example>
      </DocSection>

      <DocSection
        title="Submenu and destructive item"
        description="A submenu opens on the inline edge of its row. The destructive row goes last, under a separator, and opens a confirm dialog before it deletes anything."
      >
        <Example
          code={`<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" iconOnly aria-label="More actions">
      <DotsThreeIcon />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start" className="w-56">
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <UserPlusIcon />
        Invite people
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuItem>
          <EnvelopeIcon />
          By email
        </DropdownMenuItem>
        <DropdownMenuItem>
          <LinkIcon />
          By link
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem inset>More options</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    <DropdownMenuItem>
      <GearIcon />
      Settings
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive">
      <TrashIcon />
      Delete project
      <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" iconOnly aria-label="More actions">
                <DotsThreeIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserPlusIcon />
                  Invite people
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem>
                    <EnvelopeIcon />
                    By email
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <LinkIcon />
                    By link
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem inset>More options</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem>
                <GearIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <TrashIcon />
                Delete project
                <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Example>
      </DocSection>

      <DocSection
        title="Row sizes"
        description="size on each row: sm (default), md or lg. Only the row height changes; the slot, the gap and the inset stay."
      >
        <Example
          previewClassName="items-start gap-6"
          code={ROW_SIZES.map(
            (s) => `<DropdownMenu>
  <DropdownMenuTrigger>
    <span>${ROW_LABEL[s]}</span>
    <CaretDownIcon />
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start">
    <DropdownMenuItem size="${s}">
      <UserIcon />
      Profile
    </DropdownMenuItem>
    <DropdownMenuItem size="${s}">
      <GearIcon />
      Settings
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
          ).join('\n')}
        >
          {ROW_SIZES.map((s) => (
            <DropdownMenu key={s}>
              <DropdownMenuTrigger>
                <span>{ROW_LABEL[s]}</span>
                <CaretDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem size={s}>
                  <UserIcon />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem size={s}>
                  <GearIcon />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </Example>
      </DocSection>
    </DocPage>
  );
}
