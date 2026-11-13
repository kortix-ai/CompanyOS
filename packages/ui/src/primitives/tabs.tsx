'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import {
  asChildRender,
  composeRefs,
  controlRender,
  stateRender,
  useNativeButton,
} from '../lib/base-ui-compat';
import { cn } from '../lib/utils';
import { SlidingTabIndicator } from './sliding-tab-indicator';

const tabsTriggerPaddingVariants = cva('', {
  variants: {
    // sm to 2xl are the control ladder (D43): --control-<size>-tab-padding.
    size: {
      default: 'gap-1.5 px-(--control-md-tab-padding)',
      xs: 'gap-1.5 px-2.5 has-[>svg]:px-2',
      sm: 'gap-1.5 px-(--control-sm-tab-padding)',
      md: 'gap-1.5 px-(--control-md-tab-padding)',
      lg: 'gap-1.5 px-(--control-lg-tab-padding)',
      xl: 'gap-1.5 px-(--control-xl-tab-padding)',
      '2xl': 'gap-2 px-(--control-2xl-tab-padding)',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const tabsTriggerHeightVariants = cva('', {
  variants: {
    size: {
      default: 'h-(--control-md-height)',
      xs: 'h-7',
      sm: 'h-(--control-sm-height)',
      md: 'h-(--control-md-height)',
      lg: 'h-(--control-lg-height)',
      xl: 'h-(--control-xl-height)',
      '2xl': 'h-(--control-2xl-height)',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

/** Shared tab typography for web and desktop. */
const tabsTriggerTextVariants = cva('font-medium', {
  variants: {
    size: {
      default: 'text-xs',
      xs: 'text-xs rounded-sm',
      sm: 'text-xs',
      md: 'text-xs',
      lg: 'text-xs',
      xl: 'text-sm',
      '2xl': 'text-sm',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

type TabsTriggerSize = 'xs' | 'sm' | 'default' | 'md' | 'lg' | 'xl' | '2xl';
type TabsSize = TabsTriggerSize;
/**
 * `default` is the filled pill; `outline` is a bordered active chip;
 * `segmented` is the raised surface chip of a segmented control.
 */
type TabsTriggerVariant = 'default' | 'outline' | 'secondary' | 'segmented';

const tabsListHeightClasses: Record<TabsSize, string> = {
  default: 'h-(--control-md-height)',
  xs: 'h-6',
  sm: 'h-(--control-sm-height)',
  md: 'h-(--control-md-height)',
  lg: 'h-(--control-lg-height)',
  xl: 'h-(--control-xl-height)',
  '2xl': 'h-(--control-2xl-height)',
};

/**
 * Radius of the segmented track, its chip and each trigger: the control radius
 * of the size (D44), the same corner a Button or Select of that size has. The
 * chip covers the whole trigger, so the radii are equal, not concentric.
 */
const tabsRadiusClasses: Record<TabsSize, string> = {
  default: 'rounded-(--control-md-radius)',
  xs: 'rounded-sm',
  sm: 'rounded-(--control-sm-radius)',
  md: 'rounded-(--control-md-radius)',
  lg: 'rounded-(--control-lg-radius)',
  xl: 'rounded-(--control-xl-radius)',
  '2xl': 'rounded-(--control-2xl-radius)',
};

/** Space between underline tabs: the bar is as wide as the label, so the gap is the only spacing. */
const tabsUnderlineGapClasses: Record<TabsSize, string> = {
  default: 'gap-(--control-md-tab-gap)',
  xs: 'gap-(--control-xs-tab-gap)',
  sm: 'gap-(--control-sm-tab-gap)',
  md: 'gap-(--control-md-tab-gap)',
  lg: 'gap-(--control-lg-tab-gap)',
  xl: 'gap-(--control-xl-tab-gap)',
  '2xl': 'gap-(--control-2xl-tab-gap)',
};

/** Tab switch: 200ms ease-out (motion.md, "Often" row: tab switch is duration-moderate). */
const TAB_SLIDE = { duration: 0.2, ease: [0, 0, 0.2, 1] } as const;

/** Stroke thickness of the active underline rule (`type="underline"` only). */
type TabsUnderlineSize = 'xs' | 'sm' | 'md' | 'lg';

const tabsUnderlineBorderClasses: Record<TabsUnderlineSize, string> = {
  xs: '**:data-[slot=tabs-trigger]:after:h-px',
  sm: '**:data-[slot=tabs-trigger]:after:h-[1.5px]',
  md: '**:data-[slot=tabs-trigger]:after:h-0.5',
  lg: '**:data-[slot=tabs-trigger]:after:h-[3px]',
};

/** Height of the sliding underline bar, by `underlineSize`. */
const tabsUnderlineBarClasses: Record<TabsUnderlineSize, string> = {
  xs: 'after:h-px',
  sm: 'after:h-[1.5px]',
  md: 'after:h-0.5',
  lg: 'after:h-[3px]',
};

/** Shared underline-list chrome; indicator height comes from `underlineSize`. */
const tabsListUnderlineBaseClasses =
  "border-border **:data-[slot=tabs-trigger]:data-[state=inactive]:text-muted-foreground text-muted-foreground **:data-[slot=tabs-trigger]:data-[state=active]:text-foreground inline-flex w-fit items-center justify-center gap-0 rounded-none border-b **:data-[slot=tabs-trigger]:relative **:data-[slot=tabs-trigger]:h-full **:data-[slot=tabs-trigger]:rounded-none **:data-[slot=tabs-trigger]:border-0 **:data-[slot=tabs-trigger]:bg-transparent **:data-[slot=tabs-trigger]:shadow-none **:data-[slot=tabs-trigger]:after:pointer-events-none **:data-[slot=tabs-trigger]:after:absolute **:data-[slot=tabs-trigger]:after:inset-x-0 **:data-[slot=tabs-trigger]:after:bottom-0 **:data-[slot=tabs-trigger]:after:rounded-full **:data-[slot=tabs-trigger]:after:bg-transparent **:data-[slot=tabs-trigger]:after:content-[''] **:data-[slot=tabs-trigger]:data-[state=active]:bg-transparent **:data-[slot=tabs-trigger]:data-[state=active]:shadow-none **:data-[slot=tabs-trigger]:data-[state=active]:after:bg-foreground **:data-[slot=tabs-trigger]:data-[state=inactive]:bg-transparent";

/**
 * `default` is the segmented control: a recessed track whose active tab is a
 * raised surface chip. `segmented` is the same control, kept as an explicit
 * name. `underline` is the flat rule. A vertical list (a settings rail) is
 * never segmented.
 */
type TabsListType = 'default' | 'underline' | 'secondary' | 'segmented';

/**
 * Segmented track + chip. Radii are concentric: the track is `rounded-md` (8px)
 * with 2px of padding, so the chip is `rounded-sm` (6px). The chip lifts with a
 * hairline ring plus `shadow-xs` — raised, not bordered, so it reads as the
 * selected thing in both themes.
 *
 * The padding is `p-[2px]`, not `p-0.5`: `--spacing` is 0.23rem, so `p-0.5` is
 * 1.84px. The chip's 1px ring leaves 0.84px of track showing, and a fraction of
 * a pixel rounds differently on each side — 1px of track on one end and none on
 * the other at 1x. A whole 2px leaves exactly 1px on every side.
 */
const tabsSegmentedTrackClasses = 'bg-muted rounded-md p-[2px]';
// The chip covers the whole trigger, so its hairline is drawn INSIDE (inset-ring)
// and it casts no shadow: an outer ring or shadow would spill past the track edge.
const tabsSegmentedChipClasses = 'bg-popover inset-ring-border rounded-sm inset-ring';

function resolveTabsTriggerSize(
  sizeProp: TabsTriggerSize | undefined,
  listSize: TabsSize,
): TabsSize {
  return sizeProp ?? listSize;
}

const TabsActiveValueContext = React.createContext<string>('');
const TabsListTypeContext = React.createContext<TabsListType>('default');
const TabsAnimateContext = React.createContext<'fluid' | 'none'>('none');
const TabsSizeContext = React.createContext<TabsSize>('default');
/** Lets `TabsTrigger` adapt to a vertical `TabsList` without every caller re-passing orientation. */
const TabsOrientationContext = React.createContext<'horizontal' | 'vertical'>('horizontal');

/** Radix: `automatic` selects a tab when it gets focus, `manual` on press only. */
const TabsActivationContext = React.createContext<'automatic' | 'manual'>('automatic');
const TabsRootOrientationContext = React.createContext<'horizontal' | 'vertical'>('horizontal');
/** Radix's ids: `<base>-trigger-<value>` and `<base>-content-<value>`, so SSR markup links tab and panel. */
const TabsBaseIdContext = React.createContext('');
/** Selects a tab. Radix selects on primary-button mousedown, before the click. */
const TabsSelectContext = React.createContext<(value: string) => void>(() => {});

const tabId = (base: string, value: string) => `${base}-trigger-${value}`;
const panelId = (base: string, value: string) => `${base}-content-${value}`;

const activeState = (s: { active?: boolean; hidden?: boolean; disabled?: boolean }) =>
  s.active === false || s.hidden ? 'inactive' : 'active';

type TabsProps = Omit<React.ComponentProps<'div'>, 'defaultValue' | 'dir'> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  activationMode?: 'automatic' | 'manual';
  dir?: 'ltr' | 'rtl';
};

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  activationMode = 'automatic',
  orientation = 'horizontal',
  ...props
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue ?? '');
  const activeValue = value !== undefined ? value : uncontrolledValue;

  const baseId = React.useId();
  const handleValueChange = React.useCallback(
    (next: string) => {
      if (next === activeValue) return;
      if (value === undefined) {
        setUncontrolledValue(next);
      }
      onValueChange?.(next);
    },
    [activeValue, onValueChange, value],
  );

  return (
    <TabsActiveValueContext.Provider value={activeValue}>
      <TabsActivationContext.Provider value={activationMode}>
        <TabsRootOrientationContext.Provider value={orientation}>
          <TabsBaseIdContext.Provider value={baseId}>
            <TabsSelectContext.Provider value={handleValueChange}>
              <TabsPrimitive.Root
                data-slot="tabs"
                data-orientation={orientation}
                className={cn('flex flex-col gap-2', className)}
                orientation={orientation}
                {...(props as Omit<typeof props, 'ref'>)}
                // Always controlled: Base UI selects its first tab when it owns an empty value; Radix selects none.
                value={activeValue}
                onValueChange={(next) => handleValueChange(String(next))}
              />
            </TabsSelectContext.Provider>
          </TabsBaseIdContext.Provider>
        </TabsRootOrientationContext.Provider>
      </TabsActivationContext.Provider>
    </TabsActiveValueContext.Provider>
  );
}

interface TabsListProps extends React.ComponentProps<'div'> {
  /** Radix `loop`: arrow keys wrap from the last tab to the first. Default `true`. */
  loop?: boolean;
  type?: TabsListType;
  /**
   * `segmented` renders the segmented control (recessed track + raised chip):
   * `<TabsList variant="segmented">`. Same as `type="segmented"`; `variant`
   * wins when both are set.
   */
  variant?: 'default' | 'secondary' | 'segmented';
  size?: TabsSize;
  /** Active underline stroke. Only applies when `type="underline"`. Default `md`. */
  underlineSize?: TabsUnderlineSize;
  animate?: 'fluid' | 'none';
  /**
   * `vertical` stacks triggers full-width in a column (e.g. a settings
   * rail) instead of laying them out inline. This is a styling switch only —
   * `aria-orientation` still comes from `orientation` on the `Tabs` root.
   * Default `horizontal`.
   */
  orientation?: 'horizontal' | 'vertical';
}

function TabsList(props: TabsListProps) {
  return <TabsListRenderer {...props} orientation={props.orientation ?? 'horizontal'} />;
}

function TabsListRenderer({
  className,
  type: typeProp = 'default',
  variant,
  size = 'md',
  underlineSize = 'md',
  animate: animateProp,
  orientation,
  children,
  loop = true,
  ...props
}: TabsListProps) {
  const activeValue = React.useContext(TabsActiveValueContext);
  const activationMode = React.useContext(TabsActivationContext);
  const rootOrientation = React.useContext(TabsRootOrientationContext);
  const isVertical = orientation === 'vertical';
  const requested: TabsListType =
    variant === 'secondary' ? 'secondary' : variant === 'segmented' ? 'segmented' : typeProp;
  // Every horizontal list that is not `underline` is the segmented control.
  // Triggers read the resolved type from context, so a vertical rail keeps its
  // own row styling.
  const type: TabsListType =
    requested === 'underline' || requested === 'secondary'
      ? requested
      : isVertical
        ? 'default'
        : 'segmented';
  const isSegmented = type === 'segmented';
  const isUnderline = !isVertical && type === 'underline';
  // The segmented chip slides by default. The underline bar slides only when
  // asked (animate="fluid"): the indicator measures one row on the x-axis, so a
  // wrapping or scrolling underline list keeps the static per-trigger rule.
  const animate = animateProp ?? (isUnderline ? 'none' : 'fluid');
  const useSlidingIndicator = (isSegmented || isUnderline) && animate === 'fluid';
  // xs keeps the inset track (2px padding, concentric chip). sm to 2xl follow
  // the control ladder: the chip covers the whole trigger, no inset.
  const trackClassName = cn(
    'text-muted-foreground inline-flex w-fit items-center justify-center',
    tabsListHeightClasses[size],
    size === 'xs' ? tabsSegmentedTrackClasses : cn('bg-muted', tabsRadiusClasses[size]),
    className,
  );
  const list = (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        type === 'secondary' &&
          cn('inline-flex w-fit items-center gap-0.5', tabsListHeightClasses[size]),
        isSegmented && 'relative z-10 flex h-full w-full items-stretch justify-center gap-0.5',
        isUnderline && tabsListUnderlineBaseClasses,
        isUnderline && !useSlidingIndicator && tabsUnderlineBorderClasses[underlineSize],
        isUnderline && tabsListHeightClasses[size],
        isUnderline && tabsUnderlineGapClasses[size],
        isVertical &&
          'flex h-auto w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-0',
        className,
      )}
      {...(props as Omit<typeof props, 'ref'>)}
      aria-orientation={rootOrientation}
      activateOnFocus={activationMode === 'automatic'}
      loopFocus={loop}
    >
      {children}
    </TabsPrimitive.List>
  );
  // The sliding pill indicator only measures the x-axis (see
  // SlidingTabIndicator) — in a column it would collapse to a
  // zero-width bar, so vertical lists render without it.
  const content =
    isUnderline && useSlidingIndicator ? (
      // The bar slides under the active label. It sits on the list's bottom
      // border (-bottom-px), so the two read as one rule.
      <SlidingTabIndicator
        activeId={activeValue}
        // Only the width reaches the wrapper; the list keeps every other class.
        className={cn('inline-flex w-fit max-w-full', /(^|\s)w-full(\s|$)/.test(className ?? '') && 'w-full')}
        indicatorClassName={cn(
          "after:bg-foreground after:absolute after:inset-x-0 after:-bottom-px after:content-['']",
          tabsUnderlineBarClasses[underlineSize],
        )}
        transition={TAB_SLIDE}
      >
        {list}
      </SlidingTabIndicator>
    ) : isVertical || type === 'underline' || type === 'secondary' ? (
      list
    ) : useSlidingIndicator ? (
      <SlidingTabIndicator
        activeId={activeValue}
        className={trackClassName}
        indicatorClassName={cn(
          tabsSegmentedChipClasses,
          size === 'xs' ? 'rounded-sm' : tabsRadiusClasses[size],
        )}
        transition={size === 'xs' ? undefined : TAB_SLIDE}
      >
        {list}
      </SlidingTabIndicator>
    ) : (
      <div className={trackClassName}>{list}</div>
    );
  return (
    <TabsListTypeContext.Provider value={type}>
      <TabsAnimateContext.Provider value={animate}>
        <TabsSizeContext.Provider value={size}>
          {
            <TabsOrientationContext.Provider value={orientation ?? 'horizontal'}>
              {content}
            </TabsOrientationContext.Provider>
          }
        </TabsSizeContext.Provider>
      </TabsAnimateContext.Provider>
    </TabsListTypeContext.Provider>
  );
}

function TabsTrigger({
  className,
  size: sizeProp,
  variant = 'default',
  value,
  asChild,
  children,
  onMouseDown,
  disabled,
  ref,
  ...props
}: Omit<React.ComponentProps<'button'>, 'value'> & {
  value: string;
  asChild?: boolean;
  size?: TabsTriggerSize;
  variant?: TabsTriggerVariant;
}) {
  const slot = asChildRender(asChild, children);
  const baseId = React.useContext(TabsBaseIdContext);
  const select = React.useContext(TabsSelectContext);
  // Radix sets the native `disabled` attribute on a disabled trigger. Base UI
  // clears it (in a layout effect and its ref) to keep the tab focusable; this
  // effect runs after both, because a child's layout effects run first.
  const buttonRef = React.useRef<HTMLElement | null>(null);
  const native = useNativeButton(asChild, children);
  const mergedRef = React.useMemo(() => composeRefs(ref, buttonRef, native.ref), [ref, native.ref]);
  React.useLayoutEffect(() => {
    const node = buttonRef.current;
    if (node?.tagName === 'BUTTON') (node as HTMLButtonElement).disabled = Boolean(disabled);
  }, [disabled]);
  const listType = React.useContext(TabsListTypeContext);
  const animate = React.useContext(TabsAnimateContext);
  const listSize = React.useContext(TabsSizeContext);
  const listOrientation = React.useContext(TabsOrientationContext);
  const size = resolveTabsTriggerSize(sizeProp, listSize);
  const isUnderlineList = listType === 'underline';
  // A segmented trigger either sits in a segmented list (the list's sliding
  // chip paints the active state) or asks for it alone with
  // `variant="segmented"` (it paints its own chip — there is no track to slide in).
  const isSegmentedList = listType === 'segmented';
  // An explicit `variant="outline"` keeps its bordered chip even in a segmented list.
  const isSecondary = !isUnderlineList && (variant === 'secondary' || listType === 'secondary');
  const isOutline = !isUnderlineList && !isSecondary && variant === 'outline';
  const isSegmented =
    !isUnderlineList && !isOutline && !isSecondary && (isSegmentedList || variant === 'segmented');
  // Outline paints its own border; the sliding pill fill would fight it.
  const useSlidingIndicator =
    !isSecondary &&
    !isOutline &&
    (isUnderlineList || !isSegmented || isSegmentedList) &&
    animate === 'fluid' &&
    listOrientation !== 'vertical';
  const isVertical = listOrientation === 'vertical';

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      data-sliding-tab={useSlidingIndicator ? value : undefined}
      data-variant={variant}
      value={value}
      className={cn(
        "focus-visible:ring-kortix-blue duration-normal ease-default inline-flex flex-1 cursor-pointer items-center justify-center rounded-[calc(var(--radius)-2.5px)] border border-transparent whitespace-nowrap transition-[color,background-color,border-color,box-shadow] focus-visible:ring-[0.6px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        tabsTriggerTextVariants({ size }),
        tabsTriggerPaddingVariants({ size }),
        isUnderlineList || isSegmentedList ? 'h-full' : tabsTriggerHeightVariants({ size }),
        // Segmented: the chip sits inside the track's padding, so the trigger
        // fills the track and takes the chip's concentric radius.
        isSegmented && (size === 'xs' ? 'rounded-sm' : tabsRadiusClasses[size]),
        // Underline: the bar is as wide as the label, so the trigger has no side padding.
        isUnderlineList && !isVertical && 'flex-none px-0',
        isUnderlineList && useSlidingIndicator && 'after:hidden',
        // Without the sliding indicator the active trigger paints the chip itself.
        isSegmented &&
          !useSlidingIndicator &&
          'data-[state=active]:bg-popover data-[state=active]:inset-ring-border data-[state=active]:inset-ring',
        isUnderlineList &&
          'data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground rounded-none bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:bg-transparent',
        // Default: a secondary-coloured pill. With animate="fluid" the sliding
        // indicator paints the pill behind the trigger, so the trigger itself
        // stays transparent; otherwise the trigger paints its own.
        !isUnderlineList &&
          !isOutline &&
          'data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:text-foreground relative z-10 data-[state=inactive]:bg-transparent',
        !isUnderlineList &&
          !isOutline &&
          !isSegmented &&
          !isSecondary &&
          (useSlidingIndicator
            ? 'data-[state=active]:bg-transparent'
            : 'data-[state=active]:bg-input'),
        isSegmented && useSlidingIndicator && 'data-[state=active]:bg-transparent',
        // Outline: bordered active chip — matches Button `outline` (border + transparent fill).
        isOutline &&
          'data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-foreground/5 hover:data-[state=inactive]:text-foreground data-[state=active]:border-border relative z-10 bg-transparent data-[state=active]:bg-transparent data-[state=inactive]:bg-transparent',
        isSecondary &&
          'data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-hover rounded-sm data-[state=inactive]:bg-transparent',
        isVertical && 'w-full justify-start text-left',
        className,
      )}
      ref={mergedRef}
      id={tabId(baseId, value)}
      aria-controls={panelId(baseId, value)}
      disabled={disabled}
      {...(props as Omit<typeof props, 'ref'>)}
      onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
        onMouseDown?.(event);
        // Radix: primary button without Ctrl selects on mousedown.
        if (!disabled && event.button === 0 && !event.ctrlKey && !event.defaultPrevented) {
          select(value);
        }
      }}
      nativeButton={native.nativeButton}
      render={
        slot.render ? stateRender('button', activeState, slot.render) : controlRender(activeState)
      }
    >
      {slot.children}
    </TabsPrimitive.Tab>
  );
}

function TabsContent({
  className,
  forceMount,
  asChild,
  children,
  ...props
}: Omit<React.ComponentProps<'div'>, 'value'> & {
  value: string;
  /** Keep the panel's content mounted while inactive (hidden). */
  forceMount?: true;
  asChild?: boolean;
}) {
  const slot = asChildRender(asChild, children);
  const baseId = React.useContext(TabsBaseIdContext);
  const active = React.useContext(TabsActiveValueContext) === props.value;
  // Radix renders every panel element (inactive ones empty and `hidden`) and
  // mounts the content only while active or with `forceMount`.
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      id={panelId(baseId, props.value)}
      aria-labelledby={tabId(baseId, props.value)}
      className={cn('flex-1 outline-none', className)}
      {...(props as Omit<typeof props, 'ref'>)}
      keepMounted
      render={stateRender('div', activeState, slot.render)}
    >
      {active || forceMount ? slot.children : null}
    </TabsPrimitive.Panel>
  );
}

/** Standalone filter pill bar — works WITHOUT a <Tabs> root. Use for filter bars, mode toggles. */
function FilterBar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="filter-bar"
      role="tablist"
      className={cn(
        'bg-foreground/5 text-muted-foreground inline-flex h-9 w-fit items-center justify-center gap-0.5 p-0.5',
        className,
      )}
      {...props}
    />
  );
}

/** Standalone filter pill — works WITHOUT a <Tabs> root. Pair with FilterBar. */
function FilterBarItem({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      data-slot="filter-bar-item"
      role="tab"
      type="button"
      className={cn(
        'duration-normal inline-flex h-[calc(100%-4px)] flex-1 cursor-pointer items-center justify-center gap-1.5 border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
        'text-muted-foreground/60 hover:text-foreground/80',
        'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:ring-foreground/6 data-[state=active]:shadow-sm data-[state=active]:ring-1',
        'disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export {
  FilterBar,
  FilterBarItem,
  Tabs,
  TabsContent,
  TabsList,
  tabsSegmentedChipClasses,
  tabsSegmentedTrackClasses,
  TabsTrigger,
  tabsTriggerHeightVariants,
  tabsTriggerPaddingVariants,
  tabsTriggerTextVariants,
};

export type {
  TabsListProps,
  TabsListType,
  TabsProps,
  TabsSize,
  TabsTriggerSize,
  TabsTriggerVariant,
  TabsUnderlineSize,
};
