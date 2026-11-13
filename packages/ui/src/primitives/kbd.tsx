import { cn } from '../lib/utils';

/**
 * One key. The same chip as a count beside a label (CountBadge, neutral): a
 * 6% ink tint, muted text, 4px corners. At least as wide as it is tall, and it
 * grows to fit a word ("Esc", "Enter"). Inside a tooltip, an inverted surface,
 * the tint and text flip to the tooltip's own ink.
 */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'bg-foreground/6 text-muted-foreground pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-(--control-xs-radius) px-1 font-sans text-xs leading-none font-medium tabular-nums select-none',
        "[&_svg:not([class*='size-'])]:size-3",
        '[[data-slot=tooltip-content]_&]:bg-background/15 [[data-slot=tooltip-content]_&]:text-background',
        className,
      )}
      {...props}
    />
  );
}

// Renders a `<kbd>` on purpose: nested `<kbd>` is the HTML idiom for one key
// COMBINATION made of individual keys. It carries no chrome of its own: it is
// spacing only (a hairline gap, so ⌘ and K read as two keys), so ancestors must
// never style it as if it were a key.
function KbdGroup({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-0.5', className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
