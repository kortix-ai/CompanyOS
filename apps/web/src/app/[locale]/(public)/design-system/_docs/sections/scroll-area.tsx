'use client';

import { ScrollArea } from '@kortix/ui/scroll-area';
import { Separator } from '@kortix/ui/separator';
import { Fragment } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const TAGS = Array.from({ length: 30 }, (_, i) => `v1.${30 - i}.0`);
const TILES = ['Design', 'Engineering', 'Sales', 'Support', 'Finance', 'Legal', 'Research', 'Marketing'];

export default function ScrollAreaPage() {
  return (
    <DocPage
      title="Scroll Area"
      lead="A scroll region with a thin overlay bar. The bar appears while the pointer is over the area or it scrolls, and only when the content overflows. It takes no width from the content."
    >
      <DocSection
        title="Vertical"
        description="Give the area a height. Put the padding on the inner content, not on the bordered area."
      >
        <Example
          code={`const TAGS = Array.from({ length: 30 }, (_, i) => \`v1.\${30 - i}.0\`);

<ScrollArea className="border-border h-56 w-48 rounded-md border">
  <div className="p-4">
    <h4 className="mb-4 text-sm font-medium">Releases</h4>
    {TAGS.map((tag) => (
      <Fragment key={tag}>
        <div className="text-sm">{tag}</div>
        <Separator className="my-2" />
      </Fragment>
    ))}
  </div>
</ScrollArea>`}
        >
          <ScrollArea className="border-border h-56 w-48 rounded-md border">
            <div className="p-4">
              <h4 className="mb-4 text-sm font-medium">Releases</h4>
              {TAGS.map((tag) => (
                <Fragment key={tag}>
                  <div className="text-sm">{tag}</div>
                  <Separator className="my-2" />
                </Fragment>
              ))}
            </div>
          </ScrollArea>
        </Example>
      </DocSection>

      <DocSection
        title="Horizontal"
        description="A row wider than the area scrolls sideways. Keep the row from wrapping with w-max."
      >
        <Example
          previewClassName="block"
          code={`const TILES = ['Design', 'Engineering', 'Sales', 'Support', 'Finance', 'Legal', 'Research', 'Marketing'];

<ScrollArea className="border-border w-full max-w-md rounded-md border">
  <div className="flex w-max gap-3 p-4">
    {TILES.map((name) => (
      <div
        key={name}
        className="bg-muted text-muted-foreground flex h-24 w-32 shrink-0 items-end rounded-md p-3 text-sm"
      >
        {name}
      </div>
    ))}
  </div>
</ScrollArea>`}
        >
          <ScrollArea className="border-border w-full max-w-md rounded-md border">
            <div className="flex w-max gap-3 p-4">
              {TILES.map((name) => (
                <div
                  key={name}
                  className="bg-muted text-muted-foreground flex h-24 w-32 shrink-0 items-end rounded-md p-3 text-sm"
                >
                  {name}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Example>
      </DocSection>
    </DocPage>
  );
}
