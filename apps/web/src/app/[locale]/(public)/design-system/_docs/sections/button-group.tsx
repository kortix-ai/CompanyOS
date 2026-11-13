'use client';

import { Button } from '@kortix/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@kortix/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kortix/ui/dropdown-menu';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PencilSimpleIcon,
  PlusIcon,
  ShareNetworkIcon,
  TrashIcon,
} from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

const SIZES = ['sm', 'md', 'lg', 'xl'] as const;

export default function ButtonGroupPage() {
  return (
    <DocPage
      title="Button Group"
      lead="Buttons that act on one object sit in one group. Members sit 1px apart; the outer corners keep the button's radius and the inner corners shrink to 4px, so the group reads as one control."
    >
      <DocSection title="Text buttons">
        <Example
          code={`<ButtonGroup>
  <Button variant="secondary">Day</Button>
  <Button variant="secondary">Week</Button>
  <Button variant="secondary">Month</Button>
</ButtonGroup>`}
        >
          <ButtonGroup>
            <Button variant="secondary">Day</Button>
            <Button variant="secondary">Week</Button>
            <Button variant="secondary">Month</Button>
          </ButtonGroup>
        </Example>
      </DocSection>

      <DocSection
        title="Sizes"
        description="The group takes the size of its buttons. Give every member the same size."
      >
        <Example
          previewClassName="flex-col items-start gap-4"
          code={SIZES.map(
            (s) => `<ButtonGroup>
  <Button variant="secondary" size="${s}">Previous</Button>
  <Button variant="secondary" size="${s}">Next</Button>
</ButtonGroup>`,
          ).join('\n')}
        >
          {SIZES.map((s) => (
            <ButtonGroup key={s}>
              <Button variant="secondary" size={s}>
                Previous
              </Button>
              <Button variant="secondary" size={s}>
                Next
              </Button>
            </ButtonGroup>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Icon buttons" description="Square members. Each one carries an aria-label.">
        <Example
          code={`<ButtonGroup>
  <Button variant="secondary" iconOnly aria-label="Search">
    <MagnifyingGlassIcon />
  </Button>
  <Button variant="secondary" iconOnly aria-label="Edit">
    <PencilSimpleIcon />
  </Button>
  <Button variant="secondary" iconOnly aria-label="Delete">
    <TrashIcon />
  </Button>
</ButtonGroup>
<ButtonGroup>
  <Button variant="outline" iconOnly aria-label="Previous">
    <ArrowLeftIcon />
  </Button>
  <Button variant="outline" iconOnly aria-label="Next">
    <ArrowRightIcon />
  </Button>
</ButtonGroup>`}
        >
          <ButtonGroup>
            <Button variant="secondary" iconOnly aria-label="Search">
              <MagnifyingGlassIcon />
            </Button>
            <Button variant="secondary" iconOnly aria-label="Edit">
              <PencilSimpleIcon />
            </Button>
            <Button variant="secondary" iconOnly aria-label="Delete">
              <TrashIcon />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button variant="outline" iconOnly aria-label="Previous">
              <ArrowLeftIcon />
            </Button>
            <Button variant="outline" iconOnly aria-label="Next">
              <ArrowRightIcon />
            </Button>
          </ButtonGroup>
        </Example>
      </DocSection>

      <DocSection
        title="Split button"
        description="One primary action and a caret that opens the alternatives. On a filled button, ButtonGroupSeparator draws the seam the 1px gap cannot."
      >
        <Example
          code={`<ButtonGroup>
  <Button>Publish</Button>
  <ButtonGroupSeparator />
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button iconOnly aria-label="More publish options">
        <CaretDownIcon />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem>Publish and share</DropdownMenuItem>
      <DropdownMenuItem>Schedule</DropdownMenuItem>
      <DropdownMenuItem>Save as draft</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</ButtonGroup>
<ButtonGroup>
  <Button variant="secondary">
    <ShareNetworkIcon />
    Share
  </Button>
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="secondary" iconOnly aria-label="More share options">
        <CaretDownIcon />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem>Copy link</DropdownMenuItem>
      <DropdownMenuItem>Invite people</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</ButtonGroup>`}
        >
          <ButtonGroup>
            <Button>Publish</Button>
            <ButtonGroupSeparator />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button iconOnly aria-label="More publish options">
                  <CaretDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Publish and share</DropdownMenuItem>
                <DropdownMenuItem>Schedule</DropdownMenuItem>
                <DropdownMenuItem>Save as draft</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <ButtonGroup>
            <Button variant="secondary">
              <ShareNetworkIcon />
              Share
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" iconOnly aria-label="More share options">
                  <CaretDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Copy link</DropdownMenuItem>
                <DropdownMenuItem>Invite people</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </Example>
      </DocSection>

      <DocSection
        title="Groups of groups"
        description="A group of groups is a toolbar. The nested groups sit 8px apart."
      >
        <Example
          code={`<ButtonGroup>
  <ButtonGroup>
    <Button variant="secondary" iconOnly aria-label="Previous">
      <ArrowLeftIcon />
    </Button>
    <Button variant="secondary" iconOnly aria-label="Next">
      <ArrowRightIcon />
    </Button>
  </ButtonGroup>
  <ButtonGroup>
    <Button variant="secondary">Archive</Button>
    <Button variant="secondary">Report</Button>
  </ButtonGroup>
</ButtonGroup>`}
        >
          <ButtonGroup>
            <ButtonGroup>
              <Button variant="secondary" iconOnly aria-label="Previous">
                <ArrowLeftIcon />
              </Button>
              <Button variant="secondary" iconOnly aria-label="Next">
                <ArrowRightIcon />
              </Button>
            </ButtonGroup>
            <ButtonGroup>
              <Button variant="secondary">Archive</Button>
              <Button variant="secondary">Report</Button>
            </ButtonGroup>
          </ButtonGroup>
        </Example>
      </DocSection>

      <DocSection title="Vertical" description='orientation="vertical" stacks the members and rounds the top and bottom.'>
        <Example
          code={`<ButtonGroup orientation="vertical">
  <Button variant="secondary" iconOnly aria-label="Zoom in">
    <PlusIcon />
  </Button>
  <Button variant="secondary" iconOnly aria-label="Zoom out">
    <MinusIcon />
  </Button>
</ButtonGroup>`}
        >
          <ButtonGroup orientation="vertical">
            <Button variant="secondary" iconOnly aria-label="Zoom in">
              <PlusIcon />
            </Button>
            <Button variant="secondary" iconOnly aria-label="Zoom out">
              <MinusIcon />
            </Button>
          </ButtonGroup>
        </Example>
      </DocSection>
    </DocPage>
  );
}
