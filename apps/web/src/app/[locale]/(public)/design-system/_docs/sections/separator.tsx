'use client';

import { Separator } from '@kortix/ui/separator';

import { DocPage, DocSection, Example } from '../doc';

export default function SeparatorPage() {
  return (
    <DocPage
      title="Separator"
      lead="A 1px rule in the border token. It is decorative by default and hidden from assistive tech; pass decorative={false} when it divides content a reader should hear as separate."
    >
      <DocSection title="Horizontal" description="Fills the width of its parent.">
        <Example
          previewClassName="block"
          code={`<div className="flex max-w-sm flex-col gap-3">
  <div className="flex flex-col gap-1.5">
    <span className="text-sm font-medium">Kortix UI</span>
    <span className="text-muted-foreground text-xs">The component library for every Kortix surface.</span>
  </div>
  <Separator />
  <span className="text-muted-foreground text-xs">Updated today</span>
</div>`}
        >
          <div className="flex max-w-sm flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Kortix UI</span>
              <span className="text-muted-foreground text-xs">The component library for every Kortix surface.</span>
            </div>
            <Separator />
            <span className="text-muted-foreground text-xs">Updated today</span>
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Vertical"
        description='orientation="vertical" fills the height of its parent, so give the row a height.'
      >
        <Example
          code={`<div className="flex h-4 items-center gap-3 text-sm">
  <span>Docs</span>
  <Separator orientation="vertical" />
  <span>Changelog</span>
  <Separator orientation="vertical" />
  <span>Status</span>
</div>`}
        >
          <div className="flex h-4 items-center gap-3 text-sm">
            <span>Docs</span>
            <Separator orientation="vertical" />
            <span>Changelog</span>
            <Separator orientation="vertical" />
            <span>Status</span>
          </div>
        </Example>
      </DocSection>

      <DocSection title="Semantic" description="Announced as a separator. Use it between groups a screen reader should hear as distinct.">
        <Example
          previewClassName="block"
          code={`<div className="flex max-w-sm flex-col gap-3 text-sm">
  <span>Members</span>
  <Separator decorative={false} />
  <span>Pending invites</span>
</div>`}
        >
          <div className="flex max-w-sm flex-col gap-3 text-sm">
            <span>Members</span>
            <Separator decorative={false} />
            <span>Pending invites</span>
          </div>
        </Example>
      </DocSection>
    </DocPage>
  );
}
