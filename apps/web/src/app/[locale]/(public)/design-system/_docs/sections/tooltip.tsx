'use client';

import { Button } from '@kortix/ui/button';
import { Hint } from '@kortix/ui/hint';
import { Kbd, KbdGroup } from '@kortix/ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@kortix/ui/tooltip';
import { GearIcon, MagnifyingGlassIcon, PlusIcon, ShareIcon, TrashIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export default function TooltipPage() {
  return (
    <DocPage
      title="Tooltip"
      lead="An inverted label in ink with 6px corners and text-xs. It names an icon-only control. In product code, write Hint: it wraps Tooltip, TooltipTrigger and TooltipContent in one element."
    >
      <DocSection title="Hint" description="The form feature code uses. label is the text; side defaults to right.">
        <Example
          code={`<Hint label="New session" side="bottom">
  <Button variant="secondary" iconOnly aria-label="New session">
    <PlusIcon />
  </Button>
</Hint>`}
        >
          <Hint label="New session" side="bottom">
            <Button variant="secondary" iconOnly aria-label="New session">
              <PlusIcon />
            </Button>
          </Hint>
        </Example>
      </DocSection>

      <DocSection
        title="Sides"
        description="side picks the edge it opens on. It opens with a 4px nudge away from that edge, and flips when the edge has no room."
      >
        <Example
          code={SIDES.map(
            (side) => `<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="outline">${side}</Button>
  </TooltipTrigger>
  <TooltipContent side="${side}">Opens ${side}</TooltipContent>
</Tooltip>`,
          ).join('\n')}
        >
          {SIDES.map((side) => (
            <Tooltip key={side}>
              <TooltipTrigger asChild>
                <Button variant="outline">{side}</Button>
              </TooltipTrigger>
              <TooltipContent side={side}>Opens {side}</TooltipContent>
            </Tooltip>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="With a shortcut"
        description="Put the keys after the label in a KbdGroup. Kbd takes the tooltip's own text color, so a key reads as recessed in both themes."
      >
        <Example
          code={`<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="secondary" iconOnly aria-label="Search">
      <MagnifyingGlassIcon />
    </Button>
  </TooltipTrigger>
  <TooltipContent side="bottom" className="flex items-center gap-2">
    Search
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  </TooltipContent>
</Tooltip>`}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" iconOnly aria-label="Search">
                <MagnifyingGlassIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-2">
              Search
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </TooltipContent>
          </Tooltip>
        </Example>
      </DocSection>

      <DocSection
        title="Delay group"
        description="TooltipProvider sets the hover delay for its subtree. The app root sets 150ms. Once one tooltip in the group is open, the next one opens at once and with no animation, so a toolbar reads fast."
      >
        <Example
          code={`<TooltipProvider delayDuration={150}>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" iconOnly aria-label="Share">
        <ShareIcon />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">Share</TooltipContent>
  </Tooltip>
  {/* …one Tooltip per control */}
</TooltipProvider>`}
        >
          <TooltipProvider delayDuration={150}>
            {(
              [
                [ShareIcon, 'Share'],
                [GearIcon, 'Settings'],
                [TrashIcon, 'Delete'],
              ] as const
            ).map(([Icon, label]) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" iconOnly aria-label={label}>
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </Example>
      </DocSection>
    </DocPage>
  );
}
