'use client';

import { Button } from '@kortix/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@kortix/ui/collapsible';
import { CaretRightIcon, CaretUpDownIcon } from '@phosphor-icons/react';
import { cn } from '@kortix/ui';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function CollapsiblePage() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);

  return (
    <DocPage
      title="Collapsible"
      lead="One region that shows and hides. It carries no chrome: the trigger and the content are yours. Use an Accordion for a stack of titled sections."
    >
      <DocSection
        title="Default"
        description="The first row stays visible; the trigger reveals the rest. Pass asChild to make a Button the trigger."
      >
        <Example
          previewClassName="block"
          code={`const [open, setOpen] = useState(false);

<Collapsible open={open} onOpenChange={setOpen} className="flex w-full max-w-sm flex-col gap-2">
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm font-medium">3 connected repositories</span>
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm" iconOnly aria-label="Show all repositories">
        <CaretUpDownIcon />
      </Button>
    </CollapsibleTrigger>
  </div>
  <div className="border-border rounded-md border px-4 py-2 text-sm">kortix/web</div>
  <CollapsibleContent className="flex flex-col gap-2">
    <div className="border-border rounded-md border px-4 py-2 text-sm">kortix/api</div>
    <div className="border-border rounded-md border px-4 py-2 text-sm">kortix/docs</div>
  </CollapsibleContent>
</Collapsible>`}
        >
          <Collapsible open={open} onOpenChange={setOpen} className="flex w-full max-w-sm flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">3 connected repositories</span>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" iconOnly aria-label="Show all repositories">
                  <CaretUpDownIcon />
                </Button>
              </CollapsibleTrigger>
            </div>
            <div className="border-border rounded-md border px-4 py-2 text-sm">kortix/web</div>
            <CollapsibleContent className="flex flex-col gap-2">
              <div className="border-border rounded-md border px-4 py-2 text-sm">kortix/api</div>
              <div className="border-border rounded-md border px-4 py-2 text-sm">kortix/docs</div>
            </CollapsibleContent>
          </Collapsible>
        </Example>
      </DocSection>

      <DocSection
        title="Disclosure"
        description="A caret that turns 90° beside a muted label. This is how an error folds its raw details."
      >
        <Example
          previewClassName="block"
          code={`const [details, setDetails] = useState(false);

<Collapsible open={details} onOpenChange={setDetails} className="w-full max-w-sm">
  <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors duration-fast ease-out">
    <CaretRightIcon
      className={cn(
        'size-3.5 transition-transform duration-moderate ease-out motion-reduce:transition-none',
        details && 'rotate-90',
      )}
    />
    Details
  </CollapsibleTrigger>
  <CollapsibleContent>
    <dl className="text-muted-foreground mt-2 grid grid-cols-3 gap-y-1 text-xs">
      <dt>Code</dt>
      <dd className="col-span-2 font-mono">rate_limited</dd>
      <dt>Request ID</dt>
      <dd className="col-span-2 font-mono">req_01HX</dd>
    </dl>
  </CollapsibleContent>
</Collapsible>`}
        >
          <Collapsible open={details} onOpenChange={setDetails} className="w-full max-w-sm">
            <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors duration-fast ease-out">
              <CaretRightIcon
                className={cn(
                  'size-3.5 transition-transform duration-moderate ease-out motion-reduce:transition-none',
                  details && 'rotate-90',
                )}
              />
              Details
            </CollapsibleTrigger>
            <CollapsibleContent>
              <dl className="text-muted-foreground mt-2 grid grid-cols-3 gap-y-1 text-xs">
                <dt>Code</dt>
                <dd className="col-span-2 font-mono">rate_limited</dd>
                <dt>Request ID</dt>
                <dd className="col-span-2 font-mono">req_01HX</dd>
              </dl>
            </CollapsibleContent>
          </Collapsible>
        </Example>
      </DocSection>
    </DocPage>
  );
}
