'use client';

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CaretUpDownIcon, CheckIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import * as React from 'react';

import { FLOATING_LAYER_ATTR } from '../lib/base-ui-compat';
import { withPortalContainer } from '../lib/portal-container';
import { cn } from '../lib/utils';
import { floatingZ, useDialogDepth } from '../lib/z-stack';
import { FLOATING_PANEL_MOTION, FLOATING_PANEL_SURFACE } from './menu-recipe';
import { TRIGGER_CARET_CLASS, TRIGGER_ICON_SIZE, triggerVariants } from './trigger-variants';

/**
 * A searchable select: a trigger that looks like `SelectTrigger`, and a popup
 * with a search field over a filtered list (Base UI "input inside popup").
 *
 * Motion (D44): every floating panel opens the same way, `FLOATING_PANEL_MOTION`
 * (0.95 → 1 and a fade, 200ms ease-in-out, from the trigger).
 */

const ComboboxPortal = withPortalContainer(ComboboxPrimitive.Portal);

type ComboboxSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  size?: ComboboxSize;
  /** Accessible name of the trigger when no visible label points at it. */
  'aria-label'?: string;
  id?: string;
  className?: string;
  /** Classes for the popup panel (width, max height). */
  contentClassName?: string;
}

/** Rows: 6px corners, concentric with the 10px panel minus its 4px (p-1) inset. */
const COMBOBOX_ITEM =
  "grid min-h-(--control-md-height) cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-sm ps-2 pe-4 py-1 text-xs font-medium text-foreground outline-none select-none transition-colors duration-fast ease-out data-highlighted:bg-foreground/6 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

function Combobox({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  disabled,
  size = 'md',
  id,
  className,
  contentClassName,
  'aria-label': ariaLabel,
}: ComboboxProps) {
  const depth = useDialogDepth();
  const byValue = React.useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const toItem = (v: string | null | undefined) => (v == null ? (v as null | undefined) : (byValue.get(v) ?? null));

  return (
    <ComboboxPrimitive.Root<ComboboxOption>
      items={options}
      value={value === undefined ? undefined : toItem(value)}
      defaultValue={defaultValue === undefined ? undefined : toItem(defaultValue)}
      onValueChange={(next) => onValueChange?.(next ? next.value : null)}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      disabled={disabled}
    >
      <ComboboxPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        data-slot="combobox-trigger"
        className={cn(triggerVariants({ variant: 'secondary', size }), 'min-w-40', className)}
      >
        <span data-slot="combobox-value" className="min-w-0 truncate">
          <ComboboxPrimitive.Value placeholder={placeholder} />
        </span>
        <CaretUpDownIcon
          aria-hidden
          className={cn(TRIGGER_CARET_CLASS, 'group-data-[state=open]/ui-trigger:rotate-0', TRIGGER_ICON_SIZE[size])}
        />
      </ComboboxPrimitive.Trigger>
      <ComboboxPortal>
        <ComboboxPrimitive.Positioner
          {...FLOATING_LAYER_ATTR}
          align="start"
          sideOffset={4}
          className="outline-none"
          style={{ zIndex: floatingZ(depth) }}
        >
          <ComboboxPrimitive.Popup
            data-slot="combobox-content"
            aria-label={ariaLabel ?? placeholder}
            className={cn(
              FLOATING_PANEL_SURFACE,
              FLOATING_PANEL_MOTION,
              'flex max-h-[min(24rem,var(--available-height))] min-w-(--anchor-width) flex-col overflow-hidden',
              contentClassName,
            )}
          >
            <div className="border-border flex h-(--control-lg-height) shrink-0 items-center gap-2 border-b px-3">
              <MagnifyingGlassIcon aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
              <ComboboxPrimitive.Input
                data-slot="combobox-input"
                placeholder={searchPlaceholder}
                className="text-foreground placeholder:text-muted-foreground h-full w-full min-w-0 bg-transparent text-xs font-medium outline-none"
              />
            </div>
            <ComboboxPrimitive.Empty className="text-muted-foreground flex items-center justify-center text-xs font-medium empty:hidden not-empty:h-16">
              {emptyText}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List
              data-slot="combobox-list"
              className="scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0"
            >
              {(item: ComboboxOption) => (
                <ComboboxPrimitive.Item
                  key={item.value}
                  value={item}
                  disabled={item.disabled}
                  data-slot="combobox-item"
                  className={COMBOBOX_ITEM}
                >
                  <ComboboxPrimitive.ItemIndicator className="col-start-1 flex items-center">
                    <CheckIcon aria-hidden className="text-muted-foreground size-3.5" />
                  </ComboboxPrimitive.ItemIndicator>
                  <span className="col-start-2 truncate">{item.label}</span>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPortal>
    </ComboboxPrimitive.Root>
  );
}

export { Combobox };
