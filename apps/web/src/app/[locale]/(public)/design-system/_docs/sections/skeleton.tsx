'use client';

import { Skeleton } from '@kortix/ui/skeleton';

import { DocPage, DocSection, Example } from '../doc';

export default function SkeletonPage() {
  return (
    <DocPage
      title="Skeleton"
      lead="A pulsing block in the primary color at 10%, with 8px corners. Use it only where the final shape is known: a row, a field, a tile. A whole page that loads shows the pulsing Kortix mark, not a skeleton."
    >
      <DocSection
        title="Text lines"
        description="Give each line the width of the text it stands for. A last line shorter than the rest reads as a paragraph."
      >
        <Example
          previewClassName="flex-col items-stretch gap-2"
          code={`<Skeleton className="h-4 w-40 rounded-sm" />
<Skeleton className="h-4 w-full rounded-sm" />
<Skeleton className="h-4 w-full rounded-sm" />
<Skeleton className="h-4 w-2/3 rounded-sm" />`}
        >
          <Skeleton className="h-4 w-40 rounded-sm" />
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="h-4 w-full rounded-sm" />
          <Skeleton className="h-4 w-2/3 rounded-sm" />
        </Example>
      </DocSection>

      <DocSection
        title="Avatar and lines"
        description="The row shape of a list: a square tile the size of the avatar, then a title line and a meta line. Repeat the row the number of times the list usually holds."
      >
        <Example
          previewClassName="flex-col items-stretch gap-4"
          code={`<div className="flex items-center gap-3">
  <Skeleton className="size-8 shrink-0 rounded-sm" />
  <div className="flex flex-1 flex-col gap-1.5">
    <Skeleton className="h-4 w-48 rounded-sm" />
    <Skeleton className="h-4 w-32 rounded-sm" />
  </div>
</div>`}
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-sm" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48 rounded-sm" />
                <Skeleton className="h-4 w-32 rounded-sm" />
              </div>
            </div>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Card"
        description="A card keeps its own border and padding while it loads, so nothing moves when the content arrives. Only the content is a skeleton."
      >
        <Example
          code={`<div className="border-border flex w-72 flex-col gap-3 rounded-md border p-4">
  <Skeleton className="h-32 w-full rounded-md" />
  <Skeleton className="h-4 w-40 rounded-sm" />
  <Skeleton className="h-4 w-full rounded-sm" />
  <div className="flex gap-2">
    <Skeleton className="h-7 w-20 rounded-md" />
    <Skeleton className="h-7 w-16 rounded-md" />
  </div>
</div>`}
        >
          <div className="border-border flex w-72 flex-col gap-3 rounded-md border p-4">
            <Skeleton className="h-32 w-full rounded-md" />
            <Skeleton className="h-4 w-40 rounded-sm" />
            <Skeleton className="h-4 w-full rounded-sm" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </div>
        </Example>
      </DocSection>
    </DocPage>
  );
}
