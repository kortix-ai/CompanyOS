'use client';

import { Button } from '@kortix/ui/button';
import { Input } from '@kortix/ui/input';
import { Label } from '@kortix/ui/label';
import {
  SplitSheet,
  SplitSheetBody,
  SplitSheetClose,
  SplitSheetContent,
  SplitSheetDescription,
  SplitSheetFooter,
  SplitSheetHeader,
  SplitSheetMain,
  SplitSheetTitle,
  SplitSheetTrigger,
  type SplitSheetSize,
} from '@kortix/ui/split-sheet';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const ROWS = ['Weekly digest', 'Release notes', 'Churn report', 'Invoice reminders'];
const SIZES: SplitSheetSize[] = ['xs', 'sm', 'md', 'lg'];

/** A bounded frame: SplitSheet needs a sized parent, and each column scrolls on its own. */
function Frame({ children }: { children: React.ReactNode }) {
  return <div className="border-border h-96 w-full overflow-hidden rounded-md border">{children}</div>;
}

function List() {
  return (
    <ul className="flex flex-col gap-px p-2">
      {ROWS.map((row) => (
        <li key={row} className="flex h-(--control-lg-height) items-center justify-between rounded-sm px-2 text-sm">
          <span>{row}</span>
          <SplitSheetTrigger asChild>
            <Button size="sm" variant="secondary">
              Details
            </Button>
          </SplitSheetTrigger>
        </li>
      ))}
    </ul>
  );
}

function Sheet() {
  return (
    <SplitSheetContent>
      <SplitSheetHeader>
        <SplitSheetTitle>Weekly digest</SplitSheetTitle>
        <SplitSheetDescription>Runs every Monday at 9:00.</SplitSheetDescription>
      </SplitSheetHeader>
      <SplitSheetBody>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ds-split-name">Name</Label>
          <Input id="ds-split-name" defaultValue="Weekly digest" />
        </div>
      </SplitSheetBody>
      <SplitSheetFooter>
        <SplitSheetClose asChild>
          <Button variant="secondary">Cancel</Button>
        </SplitSheetClose>
        <Button>Save</Button>
      </SplitSheetFooter>
    </SplitSheetContent>
  );
}

const CODE = `<SplitSheet>
  <SplitSheetMain>
    <SplitSheetTrigger asChild>
      <Button size="sm" variant="secondary">Details</Button>
    </SplitSheetTrigger>
  </SplitSheetMain>
  <SplitSheetContent>
    <SplitSheetHeader>
      <SplitSheetTitle>Weekly digest</SplitSheetTitle>
      <SplitSheetDescription>Runs every Monday at 9:00.</SplitSheetDescription>
    </SplitSheetHeader>
    <SplitSheetBody>…</SplitSheetBody>
    <SplitSheetFooter>
      <SplitSheetClose asChild>
        <Button variant="secondary">Cancel</Button>
      </SplitSheetClose>
      <Button>Save</Button>
    </SplitSheetFooter>
  </SplitSheetContent>
</SplitSheet>`;

export default function SplitSheetPage() {
  const [size, setSize] = useState<SplitSheetSize>('md');
  const [open, setOpen] = useState(false);

  return (
    <DocPage
      wide
      title="Split Sheet"
      lead="A sheet that takes a column of the layout instead of floating over it. The page narrows to make room: no overlay, no focus trap, no scroll lock. Below 48rem of its own width it covers the page instead, as on a phone."
    >
      <DocSection
        title="Default"
        description="Click Details. The list keeps its scroll and stays usable beside the sheet; Escape inside the sheet closes it."
      >
        <Example previewClassName="block p-4" code={CODE}>
          <Frame>
            <SplitSheet className="h-full">
              <SplitSheetMain>
                <List />
              </SplitSheetMain>
              <Sheet />
            </SplitSheet>
          </Frame>
        </Example>
      </DocSection>

      <DocSection
        title="Sizes"
        description="The sheet column is xs 18rem, sm 20rem, md 24rem (the default) or lg 28rem, never more than half the root."
      >
        <Example previewClassName="flex-col items-stretch gap-3 p-4" code={`<SplitSheet size="${size}">…</SplitSheet>`}>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <Button key={s} size="sm" variant={s === size ? 'default' : 'secondary'} onClick={() => setSize(s)}>
                {s}
              </Button>
            ))}
          </div>
          <Frame>
            <SplitSheet key={size} size={size} defaultOpen className="h-full">
              <SplitSheetMain>
                <List />
              </SplitSheetMain>
              <Sheet />
            </SplitSheet>
          </Frame>
        </Example>
      </DocSection>

      <DocSection title="Controlled" description="Pass open and onOpenChange when the page decides, for example from the URL.">
        <Example
          previewClassName="flex-col items-stretch gap-3 p-4"
          code={`const [open, setOpen] = useState(false);

<SplitSheet open={open} onOpenChange={setOpen}>…</SplitSheet>`}
        >
          <div>
            <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
              {open ? 'Close the sheet' : 'Open the sheet'}
            </Button>
          </div>
          <Frame>
            <SplitSheet open={open} onOpenChange={setOpen} className="h-full">
              <SplitSheetMain>
                <List />
              </SplitSheetMain>
              <Sheet />
            </SplitSheet>
          </Frame>
        </Example>
      </DocSection>
    </DocPage>
  );
}
