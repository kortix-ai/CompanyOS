'use client';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@kortix/ui/context-menu';
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadSimpleIcon,
  FolderIcon,
  PencilSimpleIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function ContextMenuPage() {
  const [hidden, setHidden] = useState(false);

  return (
    <DocPage
      title="Context Menu"
      lead="The dropdown's rows and panel, opened by a right-click (or a long press) at the pointer. The trigger is the region itself and carries no styling of its own."
    >
      <DocSection
        title="Default"
        description="Right-click inside the dashed area. It uses the same row types as the Dropdown Menu."
      >
        <Example
          previewClassName="block"
          code={`const [hidden, setHidden] = useState(false);

<ContextMenu>
  <ContextMenuTrigger asChild>
    <div className="border-border text-muted-foreground flex h-36 w-full items-center justify-center rounded-md border border-dashed text-sm">
      Right-click here
    </div>
  </ContextMenuTrigger>
  <ContextMenuContent className="w-56">
    <ContextMenuItem>
      <ArrowLeftIcon />
      Back
      <ContextMenuShortcut>⌘[</ContextMenuShortcut>
    </ContextMenuItem>
    <ContextMenuItem disabled>
      <ArrowRightIcon />
      Forward
      <ContextMenuShortcut>⌘]</ContextMenuShortcut>
    </ContextMenuItem>
    <ContextMenuItem>
      <ArrowClockwiseIcon />
      Reload
      <ContextMenuShortcut>⌘R</ContextMenuShortcut>
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <FolderIcon />
        Move to
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-44">
        <ContextMenuItem>Inbox</ContextMenuItem>
        <ContextMenuItem>Archive</ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuItem>
      <PencilSimpleIcon />
      Rename
    </ContextMenuItem>
    <ContextMenuItem>
      <DownloadSimpleIcon />
      Download
    </ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuLabel>View</ContextMenuLabel>
    <ContextMenuCheckboxItem checked={hidden} onCheckedChange={setHidden}>
      Show hidden files
    </ContextMenuCheckboxItem>
    <ContextMenuSeparator />
    <ContextMenuItem variant="destructive">
      <TrashIcon />
      Delete
      <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>`}
        >
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="border-border text-muted-foreground flex h-36 w-full items-center justify-center rounded-md border border-dashed text-sm">
                Right-click here
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem>
                <ArrowLeftIcon />
                Back
                <ContextMenuShortcut>⌘[</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem disabled>
                <ArrowRightIcon />
                Forward
                <ContextMenuShortcut>⌘]</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem>
                <ArrowClockwiseIcon />
                Reload
                <ContextMenuShortcut>⌘R</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <FolderIcon />
                  Move to
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  <ContextMenuItem>Inbox</ContextMenuItem>
                  <ContextMenuItem>Archive</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem>
                <PencilSimpleIcon />
                Rename
              </ContextMenuItem>
              <ContextMenuItem>
                <DownloadSimpleIcon />
                Download
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuLabel>View</ContextMenuLabel>
              <ContextMenuCheckboxItem checked={hidden} onCheckedChange={setHidden}>
                Show hidden files
              </ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive">
                <TrashIcon />
                Delete
                <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </Example>
      </DocSection>
    </DocPage>
  );
}
