'use client';

import * as React from 'react';
import { useUiStrings } from '../providers/ui-provider';

import {
  CommandEmptyCore,
  CommandGroupCore,
  CommandInputCore,
  CommandItemCore,
  CommandListCore,
  CommandRoot,
  CommandSeparatorCore,
  useCommandState,
} from './command-core';

import { cn } from '../lib/utils';
import {
  ArrowDownIcon,
  ArrowElbowDownLeftIcon,
  ArrowUpIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react';
import { FadedScrollArea } from './faded-scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/** The headless cmdk-compatible parts (`./command-core`), named as cmdk names them. */
const CommandPrimitive = Object.assign(CommandRoot, {
  Input: CommandInputCore,
  List: CommandListCore,
  Empty: CommandEmptyCore,
  Group: CommandGroupCore,
  Separator: CommandSeparatorCore,
  Item: CommandItemCore,
});

const CMDK_SHARED_CLASSES = [
  '[&_[cmdk-group]]:px-1.5',
  '[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0',
].join(' ');

/**
 * `data-nav` records which input moved the highlight last: `pointer` or
 * `keyboard`. `CommandItem` reads it to pick ONE highlight source.
 *
 * The command core (cmdk 0.2.1) selects a row on every `pointermove` through its store, so
 * `data-selected` moves only after React re-renders the whole list. In the ⌘K
 * palette that re-render trails the cursor: the row you left stays lit until
 * it lands, which reads as a hover transition. In pointer mode the row paints
 * from CSS `:hover` alone — the same instant highlight the sidebar session
 * rows use. Keyboard mode keeps `data-selected`, because arrow keys have no
 * `:hover` to follow.
 *
 * Written straight to the DOM node, not React state: a state update here would
 * re-render the list on every pointer move, which is the lag this removes.
 * cmdk calls a caller's `onKeyDown` before its own handler and spreads
 * `onPointerMove` onto the root, so both reach the same element.
 */
function Command({
  className,
  onKeyDown,
  onPointerMove,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md',
        className,
      )}
      onKeyDown={(event) => {
        event.currentTarget.dataset.nav = 'keyboard';
        onKeyDown?.(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
          event.currentTarget.dataset.nav = 'pointer';
        }
        onPointerMove?.(event);
      }}
      {...props}
    />
  );
}

function CommandDialog({
  title,
  description,
  children,
  className,
  showCloseButton = true,
  filter,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  /** cmdk's ranking (value, search, keywords) → 0..1. Default: cmdk's fuzzy score. */
  filter?: React.ComponentProps<typeof CommandPrimitive>['filter'];
}) {
  const strings = useUiStrings();

  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title ?? strings.commandPaletteTitle}</DialogTitle>
        <DialogDescription>{description ?? strings.commandPaletteDescription}</DialogDescription>
      </DialogHeader>
      <DialogContent
        // Opens and closes like every dialog (D44): 0.95 → 1 and a fade in 200ms.
        className={cn(
          'border-0 p-0 shadow-ring-xl',
          className,
        )}
        hideCloseButton={!showCloseButton}
        overlayClassName="bg-black/20 backdrop-blur-[1px]" // audit:allow the palette scrim is lighter than a dialog: it is summoned and dismissed constantly
      >
        {/* `loop`: ↑ on the first row lands on the last, ↓ on the last lands on
            the first — the list is a ring, so the far end is one key away. */}
        <Command
          loop
          filter={filter}
          className="[&_[cmdk-group-heading]]:text-muted-foreground bg-popover **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  compact,
  leftElement,
  rightElement,

  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  compact?: boolean;
  /** Sits before the text field: a search glyph, or a sub-page's back chip. */
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}) {
  return (
    <div
      data-slot="command-input-wrapper"
      className={cn(
        'border-border flex items-center border-b',
        compact ? 'h-11 gap-2.5 px-4' : 'h-10 gap-3 px-4',
      )}
    >
      {leftElement}
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
          compact ? 'h-11' : 'h-10',
          className,
        )}
        {...props}
      />
      {rightElement}
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', className)}
      {...props}
    />
  );
}

function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'text-foreground [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[length:var(--text-xs,0.8125rem)] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-normal',
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('bg-border -mx-1 h-px', className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      // `hover:` mirrors the cmdk `data-[selected=true]` styling on purpose:
      // cmdk paints its highlight from a JS pointermove -> select loop, and a
      // page where anything swallows pointermove (observed on dev.kortix.com)
      // renders NO hover feedback at all while clicks keep working. CSS :hover
      // is driven by browser hit-testing, so the row under the cursor is
      // always highlighted; when cmdk's pointer selection works the two states
      // coincide on the same row.
      //
      // `data-[selected=true]` is scoped to NOT pointer mode (`data-nav` on the
      // `Command` root — see there). With a mouse, `:hover` is the only
      // highlight, so it follows the cursor on the frame it moves instead of
      // waiting for cmdk's re-render. With the keyboard, `data-selected` is.
      // A caller that restyles the selected row must write the same
      // `[&:not([data-nav=pointer]_*)]:data-[selected=true]:` prefix, so
      // tailwind-merge replaces this class instead of stacking a second one.
      className={cn(
        // `bg-hover`: the fill of a project sidebar session row on hover.
        // That row paints `--card` on the canvas; in light mode `--hover`
        // (ink @ 4.5%) over the white popover blends to the same #f3f3f3–
        // #f4f4f4. `bg-card` itself cannot be used here: dark-theme `--card`
        // and `--accent` ARE `--popover` (all surface-1), so it would paint
        // invisibly on this panel. `--hover` is translucent ink, so it reads
        // on any surface in both themes. It replaced `bg-primary/10`, which
        // read too dark next to the sidebar rows.
        'hover:bg-hover hover:text-foreground transition-none',
        '[&:not([data-nav=pointer]_*)]:data-[selected=true]:bg-hover [&:not([data-nav=pointer]_*)]:data-[selected=true]:text-foreground',
        "[&_svg:not([class*='text-'])]:text-muted-foreground relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
      {...props}
    />
  );
}

function CommandFooter({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="command-footer"
      className={cn(
        'text-muted-foreground flex items-center gap-4 border-t px-4 py-2 text-xs',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * The ⌘K palette (D46): the one shape every command palette takes. A
 * CommandDialog pinned 17vh from the top at 600px (the input stays put while
 * the list under it grows or shrinks), a search glyph in the input, a list in a
 * faded scroll area capped at min(60vh, 380px), and an optional footer of key
 * hints. The workspace palette (apps/web features/workspace/command-palette)
 * renders this; the design system shows it.
 */
function CommandPalette({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  value,
  onValueChange,
  inputRef,
  leftElement,
  rightElement,
  listClassName,
  footer,
  filter,
  children,
}: {
  /** cmdk's ranking (value, search, keywords) → 0..1. Default: cmdk's fuzzy score. */
  filter?: React.ComponentProps<typeof CommandPrimitive>['filter'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Replaces the search glyph, for a sub-page's back button. */
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  listClassName?: string;
  /** Key hints under the list; `CommandPaletteHints` is the standard set. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="top-[17vh] translate-y-0 sm:max-w-[600px]"
      showCloseButton={false}
      filter={filter}
    >
      <CommandInput
        ref={inputRef}
        leftElement={leftElement ?? <MagnifyingGlassIcon className="text-muted-foreground size-4 shrink-0" />}
        rightElement={rightElement}
        placeholder={placeholder}
        value={value}
        onValueChange={onValueChange}
      />
      <FadedScrollArea fadeColor="from-popover" className="max-h-[min(60vh,380px)]">
        {/* `scroll-my-10` = the fade's height: cmdk scrolls the highlighted row
            into view at the edge, which would leave it under the fade. */}
        <CommandList className={cn('max-h-none overflow-visible [&_[cmdk-item]]:scroll-my-10', listClassName)}>
          {children}
        </CommandList>
      </FadedScrollArea>
      {footer ? <CommandFooter>{footer}</CommandFooter> : null}
    </CommandDialog>
  );
}

/** The palette's standard footer: ↑↓ to move, ↵ to select, then any extras on the end. */
function CommandPaletteHints({
  navigateLabel,
  selectLabel,
  children,
}: {
  navigateLabel: string;
  selectLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        <ArrowUpIcon className="size-3" />
        <ArrowDownIcon className="size-3" />
        <span>{navigateLabel}</span>
      </div>
      <div className="flex items-center gap-1">
        <ArrowElbowDownLeftIcon className="size-3" />
        <span>{selectLabel}</span>
      </div>
      {children}
    </>
  );
}

function CommandPopover({
  open,
  onOpenChange,
  children,
  modal = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  modal?: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={modal}>
      {children}
    </Popover>
  );
}

const CommandPopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverTrigger>,
  Omit<React.ComponentPropsWithoutRef<typeof PopoverTrigger>, 'asChild'>
>(function CommandPopoverTrigger({ children, ...props }, ref) {
  return (
    <PopoverTrigger ref={ref} asChild {...props}>
      {children}
    </PopoverTrigger>
  );
});

function CommandPopoverContent({
  children,
  side = 'top',
  align = 'start',
  sideOffset = 8,
  className,
  shouldFilter = false,
  defaultValue,
}: {
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  shouldFilter?: boolean;
  /** The item value highlighted when the list opens (cmdk `defaultValue`). */
  defaultValue?: string;
}) {
  return (
    <PopoverContent
      side={side}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'bg-sidebar text-sidebar-foreground hover:text-foreground relative w-[300px] overflow-hidden rounded-lg border p-0 shadow-xs ease-out',
        'border-border',
        'data-[state=closed]:duration-[140ms] data-[state=open]:duration-[180ms]',
        'data-[state=open]:zoom-in-[0.97] data-[state=closed]:zoom-out-[0.97]',
        '[&_[data-slot=command-input-wrapper]]:h-9 [&_[data-slot=command-input-wrapper]]:gap-2 [&_[data-slot=command-input-wrapper]]:px-3',
        '[&_[data-slot=command-input]]:h-9 [&_[data-slot=command-input]]:text-sm',
        '[&_[data-slot=command-list]]:py-0',
        '[&_[data-slot=command-group]]:py-1',
        '[&_[cmdk-group-heading]]:!px-2 [&_[cmdk-group-heading]]:!pt-2 [&_[cmdk-group-heading]]:!pb-1 [&_[cmdk-group-heading]]:!text-xs [&_[cmdk-group-heading]]:!tracking-[0.12em]',
        className,
      )}
    >
      <Command
        shouldFilter={shouldFilter}
        defaultValue={defaultValue}
        className={CMDK_SHARED_CLASSES}
      >
        {children}
      </Command>
    </PopoverContent>
  );
}

export {
  Command,
  CommandDialog,
  CommandPalette,
  CommandPaletteHints,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPopover,
  CommandPopoverContent,
  CommandPopoverTrigger,
  CommandSeparator,
  CommandShortcut,
  useCommandState,
};
