import { Slot } from '../lib/base-ui-compat';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';
import Loading from './loading';

/**
 * The control ladder (D43, `visual-system.json` `controls`). Height, padding,
 * gap, icon and radius come from `--control-<size>-*`, so a button, a tab and a
 * select trigger of one size line up to the pixel. The side that holds an icon
 * sits closer to the edge (`padding-icon`). `data-icon-only` makes it square.
 * Text children are wrapped in a <span> (`wrapText`): CSS `:first-child` skips
 * text nodes, so a bare label would leave a lone icon both first and last.
 * Literal strings: Tailwind reads class names from source, not from runtime.
 */
const CONTROL_SIZE = {
  sm: "h-(--control-sm-height) px-(--control-sm-padding) gap-(--control-sm-gap) rounded-(--control-sm-radius) text-xs [&_svg:not([class*='size-'])]:size-(--control-sm-icon) not-data-icon-only:has-[>svg:first-child]:ps-(--control-sm-padding-icon) not-data-icon-only:has-[>svg:nth-last-child(1_of_:not([data-spinner]))]:pe-(--control-sm-padding-icon) data-icon-only:w-(--control-sm-height) data-icon-only:px-0 data-icon-only:rounded-(--control-sm-icon-only-radius)",
  md: "h-(--control-md-height) px-(--control-md-padding) gap-(--control-md-gap) rounded-(--control-md-radius) text-xs [&_svg:not([class*='size-'])]:size-(--control-md-icon) not-data-icon-only:has-[>svg:first-child]:ps-(--control-md-padding-icon) not-data-icon-only:has-[>svg:nth-last-child(1_of_:not([data-spinner]))]:pe-(--control-md-padding-icon) data-icon-only:w-(--control-md-height) data-icon-only:px-0 data-icon-only:rounded-(--control-md-icon-only-radius)",
  lg: "h-(--control-lg-height) px-(--control-lg-padding) gap-(--control-lg-gap) rounded-(--control-lg-radius) text-xs [&_svg:not([class*='size-'])]:size-(--control-lg-icon) not-data-icon-only:has-[>svg:first-child]:ps-(--control-lg-padding-icon) not-data-icon-only:has-[>svg:nth-last-child(1_of_:not([data-spinner]))]:pe-(--control-lg-padding-icon) data-icon-only:w-(--control-lg-height) data-icon-only:px-0 data-icon-only:rounded-(--control-lg-icon-only-radius)",
  xl: "h-(--control-xl-height) px-(--control-xl-padding) gap-(--control-xl-gap) rounded-(--control-xl-radius) text-xs [&_svg:not([class*='size-'])]:size-(--control-xl-icon) not-data-icon-only:has-[>svg:first-child]:ps-(--control-xl-padding-icon) not-data-icon-only:has-[>svg:nth-last-child(1_of_:not([data-spinner]))]:pe-(--control-xl-padding-icon) data-icon-only:w-(--control-xl-height) data-icon-only:px-0 data-icon-only:rounded-(--control-xl-icon-only-radius)",
} as const;

const buttonVariants = cva(
  "flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity,scale,translate] disabled:pointer-events-none disabled:opacity-50  [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none  aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive text-center shadow-none data-[state=open]:ring-0 focus-visible:outline-none focus-visible:ring-kortix-base focus-visible:ring-[0.6px] relative active:not-disabled:scale-[0.96] motion-reduce:active:not-disabled:scale-100",

  {
    variants: {
      variant: {
        default: 'bg-action text-action-foreground hover:bg-action/90',
        brand:
          'bg-kortix-blue/90 dark:bg-kortix-blue/60 text-background dark:text-foreground shadow-xs hover:bg-kortix-blue/85 dark:hover:bg-kortix-blue/50 transition-colors duration-moderate ease-out',
        blue: 'bg-kortix-blue text-background dark:text-foreground shadow-xs hover:bg-kortix-blue/90',
        'blue-ghost': 'hover:bg-sidebar-accent/40 text-kortix-blue',
        'blue-secondary': 'bg-kortix-blue/10 text-kortix-blue hover:bg-kortix-blue/20',
        danger:
          'bg-destructive text-background hover:bg-destructive/90 focus-visible:ring-destructive/35 focus-visible:ring-offset-4 focus-visible:ring-2',
        destructive:
          'bg-destructive/80 text-background hover:bg-destructive/85 focus-visible:ring-destructive/35 focus-visible:ring-offset-1 focus-visible:ring-2',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-foreground/5 hover:text-foreground',
        'outline-ghost': 'border border-primary/10 hover:bg-background/50 hover:text-foreground',
        secondary: 'bg-secondary  hover:bg-secondary/90    text-foreground ',
        'secondary-outline': 'bg-secondary hover:bg-secondary border border-border text-foreground',
        sidebar: 'text-sidebar-foreground hover:bg-sidebar-accent/80 ',
        background: 'bg-background hover:bg-background/90  text-foreground ',
        input:
          'bg-input dark:bg-input/30  text-foreground hover:bg-input/95 dark:hover:bg-input/235',
        accent: 'bg-foreground/5 text-accent-foreground hover:bg-foreground/8 rounded-md',
        ghost: 'bg-transparent text-foreground hover:bg-foreground/10 hover:text-foreground',
        muted: 'bg-muted text-foreground hover:bg-muted/90',
        link: 'text-foreground underline-offset-4 hover:underline bg-transparent',
        foreground: 'bg-foreground text-foreground-foreground hover:bg-foreground/90',
        'outline-foreground':
          'border border-foreground/10 bg-foreground/80 hover:bg-foreground/90 text-foreground/80 hover:text-foreground',
        inverse:
          'w-fit dark:bg-[#0a0a0a] dark:hover:bg-[#0a0a0a]/95 dark:text-[#fafafa] bg-[#fafafa] hover:bg-[#fafafa]/95 text-[#0a0a0a]',
        'invert-outline-foreground':
          'border border-background/10 bg-foreground/90 hover:bg-foreground text-background hover:text-background',
        transparent: 'bg-transparent hover:bg-transparent text-foreground',
        text: 'text-muted-foreground hover:text-primary',
        'ghost-input': 'bg-transparent hover:bg-input ',
        'ghost-sidebar': 'bg-transparent hover:bg-sidebar hover:text-sidebar-accent-foreground',
        'outline-sidebar':
          'border border-border bg-transparent hover:bg-sidebar hover:text-sidebar-accent-foreground',

        success: 'bg-kortix-green/80 text-background hover:bg-kortix-green/85',
        error: 'bg-kortix-red/80 text-background hover:bg-kortix-red/85',
        info: 'bg-kortix-blue/80 text-background hover:bg-kortix-blue/85',
        warning: 'bg-kortix-orange/80 text-background hover:bg-kortix-orange/85',
        popover: 'bg-popover text-foreground',
      },
      size: {
        // The control ladder (D43): exact pixels from --control-<size>-*.
        default: CONTROL_SIZE.md,
        md: CONTROL_SIZE.md,
        // In a group, the radius of its icon neighbours (`icon-sm`, `icon`), so the group's outer corners match.
        xs: 'h-7  gap-1.5 px-2.5 rounded-sm in-data-[slot=button-group]:rounded-md has-[>svg]:px-2',
        base: "h-7 gap-1 px-2.5   in-data-[slot=button-group]:rounded-2xl has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: CONTROL_SIZE.sm,
        lg: CONTROL_SIZE.lg,
        xl: CONTROL_SIZE.xl,
        icon: 'size-7 ',
        'icon-xs': 'size-6 rounded-sm',
        'icon-sm': 'size-7',
        'icon-base': 'size-8 rounded-md',
        'icon-md': 'size-9',
        'icon-lg': 'size-10 rounded-md',
        'magic-sm': 'h-9 px-4 py-2 has-[>svg]:px-3  sm:h-8 sm:gap-1.5 sm:px-3 sm:has-[>svg]:px-2.5',

        toolbar: "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
      },
      shape: {
        rounded: '',
        pill: 'rounded-full data-icon-only:rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      shape: 'rounded', // audit:allow prop value, not the legacy class
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Square button that holds one icon: width = height, no padding. Give it an `aria-label`. */
  iconOnly?: boolean;
  /**
   * Work in flight: the label hides (the width holds), a spinner shows, clicks
   * stop. A real `<button>` only: with `asChild` it is ignored, because a
   * slotted link cannot be disabled and Slot takes one child.
   */
  pending?: boolean;
}

/**
 * Wrap bare text in a <span> so the icon-side padding selectors see it.
 * Adjacent text joins into ONE span (`Delete {n} files` is one label), and a
 * whitespace-only run (the space in `<Icon /> {label}`) is dropped, as a flex
 * container drops it: one span per run, or the gap would count twice.
 */
function wrapText(children: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let run = '';
  const flush = () => {
    if (run.trim()) out.push(<span key={`text-${out.length}`}>{run}</span>);
    run = '';
  };
  for (const child of React.Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') run += String(child);
    else {
      flush();
      out.push(child);
    }
  }
  flush();
  return out;
}

function Button({
  className,
  variant,
  size,
  shape,
  asChild = false,
  iconOnly = false,
  pending = false,
  disabled,
  children,
  ...props
}: Omit<React.ComponentProps<'button'>, keyof ButtonProps> & ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const Comp = asChild ? Slot : 'button';
  const isPending = pending && !asChild;

  return (
    <Comp
      data-slot="button"
      data-icon-only={iconOnly || undefined}
      data-pending={isPending || undefined}
      aria-busy={isPending || undefined}
      className={cn(
        buttonVariants({ variant, size, shape, className }),
        // Pending hides every child but the spinner; the spinner keeps the button's own ink.
        // opacity, not visibility: a hidden label would drop the accessible name.
        isPending && '*:not-data-spinner:opacity-0 disabled:opacity-100',
      )}
      {...props}
      // After the caller's props, so the attribute order is the same as before
      // pending existed (aria-* first, then disabled).
      disabled={disabled || isPending}
    >
      {/* Slot takes exactly one child, so asChild never gets the spinner. */}
      {asChild ? (
        // Clone only a child that has children: a void element (<input>) takes none.
        React.isValidElement<{ children?: React.ReactNode }>(children) && children.props.children != null
          ? React.cloneElement(children, undefined, wrapText(children.props.children))
          : children
      ) : (
        <>
          {wrapText(children)}
          {isPending ? (
            <span data-spinner className="absolute inset-0 flex items-center justify-center">
              <Loading variant="ring" className="text-current!" />
            </span>
          ) : null}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
