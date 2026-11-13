'use client';

import { Button } from '@kortix/ui/button';
import { Input } from '@kortix/ui/input';
import { Label } from '@kortix/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@kortix/ui/popover';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function PopoverPage() {
  const [open, setOpen] = useState(false);

  return (
    <DocPage
      title="Popover"
      lead="A floating panel attached to its trigger: 288px wide, 16px padding, the popover surface with a ring and a shadow. It scales from its trigger, 0.95 to 1 in 200ms. Use it for a small task that does not need a page: a rename, a filter, a short form."
    >
      <DocSection title="Default">
        <Example
          code={`<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">Details</Button>
  </PopoverTrigger>
  <PopoverContent>
    <p className="text-sm font-medium">Sandbox</p>
    <p className="text-muted-foreground mt-1 text-sm">
      Each session runs in its own sandbox. It stops when the session is idle.
    </p>
  </PopoverContent>
</Popover>`}
        >
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Details</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-sm font-medium">Sandbox</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Each session runs in its own sandbox. It stops when the session is idle.
              </p>
            </PopoverContent>
          </Popover>
        </Example>
      </DocSection>

      <DocSection
        title="With a form"
        description="Control open when the form submits: close the panel on save. align sets the edge it lines up with; side the edge it opens on."
      >
        <Example
          code={`const [open, setOpen] = useState(false);

<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="secondary">Rename</Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="flex flex-col gap-3">
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-name">Project name</Label>
        <Input id="project-name" size="md" defaultValue="Research notes" autoFocus />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  </PopoverContent>
</Popover>`}
        >
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="secondary">Rename</Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex flex-col gap-3">
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  setOpen(false);
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input id="project-name" size="md" defaultValue="Research notes" autoFocus />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                </div>
              </form>
            </PopoverContent>
          </Popover>
        </Example>
      </DocSection>
    </DocPage>
  );
}
