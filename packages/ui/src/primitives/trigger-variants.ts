import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The shared look for every disclosure trigger in the system — Select, Dropdown,
 * Popover, Sheet, Modal, Dialog. One definition so a bare trigger renders the
 * same box regardless of which overlay it opens.
 *
 * `secondary` (default) and `outline` draw the input field surface; `transparent`
 * keeps `border-transparent` from the base, so the box metrics stay identical
 * and a row of mixed variants aligns to the same baseline.
 *
 * Triggers rendered with `asChild` opt out entirely — the child owns its styling.
 */
/** Literal classes, not composed from input.tsx, so Tailwind can see every prefixed one. */
const fieldTriggerClasses = [
  'bg-popover border-border',
  'focus-visible:border-ring focus-visible:ring-ring/15 focus-visible:ring-3',
  'data-[state=open]:border-ring data-[state=open]:ring-ring/15 data-[state=open]:ring-3',
].join(' ');

export const triggerVariants = cva(
  [
    'group/ui-trigger flex w-fit shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent font-normal outline-none',
    'text-foreground data-placeholder:text-muted-foreground',
    // Never `transition-all`: only the properties that actually change on hover/press.
    'transition-[background-color,border-color,color,box-shadow,transform] duration-normal ease-out',
    'focus-visible:ring-kortix-base focus-visible:ring-[0.6px] focus-visible:outline-none data-[state=open]:ring-0',
    'disabled:cursor-not-allowed disabled:opacity-50',
    // One line, ellipsised. `truncate`, not `line-clamp-1`: line-clamp sets
    // `display: -webkit-box` on every direct <span>, which out-ranks a child's
    // own `flex` — an icon + label wrapper then stacked the icon ABOVE the
    // label and lost its gap. `truncate` changes overflow only, not display.
    '[&>span]:min-w-0 [&>span]:truncate [&>span]:text-left',
    // A child icon takes the control ladder's icon size (set per size below);
    // without it a Phosphor glyph renders at its own default, 32px. A trailing
    // icon is the caret: muted, like the Select caret.
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&>svg:last-child:not(:first-child)]:text-muted-foreground",
  ],
  {
    variants: {
      variant: {
        // `secondary` and `outline` are form-field triggers: they draw the exact
        // surface `Input` draws (`inputSurfaceClasses` in input.tsx), and an OPEN
        // trigger shows the same border + 3px halo as a focused input, so a
        // Select beside a text field reads as one form.
        secondary: fieldTriggerClasses,
        outline: fieldTriggerClasses,
        // Only the borderless toolbar trigger takes a press scale. A form field
        // does not shrink under the pointer — an input never does, and a
        // Select beside it should behave the same.
        transparent: 'bg-transparent hover:bg-foreground/5 motion-safe:active:scale-[0.98]',
      },
      // The control ladder (D43): the trigger is the same height as a Button of
      // the same size. The caret side is 2px tighter (select-pe < select-ps).
      size: {
        sm: "[&_svg:not([class*='size-'])]:size-(--control-sm-icon) h-(--control-sm-height) ps-(--control-sm-select-ps) pe-(--control-sm-select-pe) rounded-(--control-sm-radius) text-xs",
        md: "[&_svg:not([class*='size-'])]:size-(--control-md-icon) h-(--control-md-height) ps-(--control-md-select-ps) pe-(--control-md-select-pe) rounded-(--control-md-radius) text-xs",
        lg: "[&_svg:not([class*='size-'])]:size-(--control-lg-icon) h-(--control-lg-height) ps-(--control-lg-select-ps) pe-(--control-lg-select-pe) rounded-(--control-lg-radius) text-xs",
        xl: "[&_svg:not([class*='size-'])]:size-(--control-xl-icon) h-(--control-xl-height) ps-(--control-xl-select-ps) pe-(--control-xl-select-pe) rounded-(--control-xl-radius) text-sm",
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export type TriggerVariantProps = VariantProps<typeof triggerVariants>;

/** Caret sizing per trigger size — matches the text step of each size. */
export const TRIGGER_ICON_SIZE = {
  sm: 'size-(--control-sm-icon)',
  md: 'size-(--control-md-icon)',
  lg: 'size-(--control-lg-icon)',
  xl: 'size-(--control-xl-icon)',
} as const;

/** The caret classes: muted, shrink-proof, and flipped while the overlay is open. */
export const TRIGGER_CARET_CLASS = [
  'text-muted-foreground shrink-0',
  'motion-safe:transition-transform motion-safe:duration-moderate motion-safe:ease-out',
  'group-data-[state=open]/ui-trigger:rotate-180',
].join(' ');
