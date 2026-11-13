'use client';

import { Avatar, AvatarFallback } from '@kortix/ui/avatar';
import { Badge } from '@kortix/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@kortix/ui/hover-card';

import { DocPage, DocSection, Example } from '../doc';

export default function HoverCardPage() {
  return (
    <DocPage
      title="Hover Card"
      lead="A preview that opens when the pointer rests on a link: 256px wide, 16px padding, the floating panel surface. It scales from its trigger. It is a preview only: everything in it must also be reachable by a click, because touch and keyboard users never see it."
    >
      <DocSection
        title="Default"
        description="It opens after 700ms and closes 300ms after the pointer leaves, so a pass over the link does not open it."
      >
        <Example
          code={`<HoverCard>
  <HoverCardTrigger href="#" className="text-sm font-medium underline underline-offset-4">
    Research notes
  </HoverCardTrigger>
  <HoverCardContent className="flex gap-3">
    <Avatar>
      <AvatarFallback>RN</AvatarFallback>
    </Avatar>
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm font-medium">Research notes</span>
      <span className="text-muted-foreground text-sm text-pretty">
        12 sessions, 3 members. Updated 2 hours ago.
      </span>
    </div>
  </HoverCardContent>
</HoverCard>`}
        >
          <HoverCard>
            <HoverCardTrigger href="#" className="text-sm font-medium underline underline-offset-4">
              Research notes
            </HoverCardTrigger>
            <HoverCardContent className="flex gap-3">
              <Avatar>
                <AvatarFallback>RN</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium">Research notes</span>
                <span className="text-muted-foreground text-sm text-pretty">
                  12 sessions, 3 members. Updated 2 hours ago.
                </span>
              </div>
            </HoverCardContent>
          </HoverCard>
        </Example>
      </DocSection>

      <DocSection
        title="Delays and side"
        description="openDelay and closeDelay are on the root, in milliseconds. side and align are on the content. animated={false} drops the scale for a card that opens into the pointer's path."
      >
        <Example
          code={`<HoverCard openDelay={300} closeDelay={100}>
  <HoverCardTrigger href="#" className="font-mono text-xs underline underline-offset-4">
    claude-sonnet
  </HoverCardTrigger>
  <HoverCardContent side="right" align="start" animated={false} className="flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Claude Sonnet</span>
      <Badge variant="info">Default</Badge>
    </div>
    <span className="text-muted-foreground text-sm">The model new sessions start with.</span>
  </HoverCardContent>
</HoverCard>`}
        >
          <HoverCard openDelay={300} closeDelay={100}>
            <HoverCardTrigger href="#" className="font-mono text-xs underline underline-offset-4">
              claude-sonnet
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" animated={false} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Claude Sonnet</span>
                <Badge variant="info">Default</Badge>
              </div>
              <span className="text-muted-foreground text-sm">The model new sessions start with.</span>
            </HoverCardContent>
          </HoverCard>
        </Example>
      </DocSection>
    </DocPage>
  );
}
