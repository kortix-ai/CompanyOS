import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * A plain container surface: a lifted region that holds content in page flow.
 * `Card` (card.tsx) is the interactive list tile with proximity hover; this is
 * the box under a form, a setting group or a code sample.
 *
 * - `surface`: `strong` is the panel fill (`bg-popover`), `subtle` the washed
 *   lift (`bg-card`), `container` the inset well (`bg-secondary`).
 * - `radius`: the app radius ladder from `rounded-md` (8px) to `rounded-xl` (14px).
 * - `elevation`: in page flow a surface is `flat` (hairline only). `elevated`
 *   adds `shadow-xs` for a surface that sits above its neighbours (effects.md).
 * - `divided`: a hairline between direct children, for a stack of rows.
 */
const cardSurfaceVariants = cva('border-border text-foreground border', {
  variants: {
    surface: {
      strong: 'bg-popover',
      subtle: 'bg-card',
      container: 'bg-secondary',
    },
    radius: {
      md: 'rounded-md',
      lg: 'rounded-lg',
      xl: 'rounded-xl',
    },
    elevation: {
      flat: '',
      elevated: 'shadow-xs',
    },
    divided: {
      true: 'divide-border divide-y',
      false: '',
    },
  },
  defaultVariants: {
    surface: 'strong',
    radius: 'xl',
    elevation: 'flat',
    divided: false,
  },
});

type CardSurfaceProps = React.ComponentProps<'div'> & VariantProps<typeof cardSurfaceVariants>;

function CardSurface({ className, surface, radius, elevation, divided, ...props }: CardSurfaceProps) {
  return (
    <div
      data-slot="card-surface"
      className={cn(cardSurfaceVariants({ surface, radius, elevation, divided }), className)}
      {...props}
    />
  );
}

export { CardSurface, cardSurfaceVariants };
export type { CardSurfaceProps };
