import { Slot } from '../lib/base-ui-compat';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[calc(var(--radius)-5px)] px-1.5 py-[0.1rem] font-mono text-[0.8rem] font-medium tracking-tight [overflow-wrap:anywhere] has-[>svg]:gap-0.5 has-[>[data-slot=status-dot]]:gap-1 [&>svg]:block [&>svg]:!size-[0.875em] [&>svg]:shrink-0 [&>svg]:pointer-events-none [&>[data-slot=status-dot]]:shrink-0 [&>[data-slot=status-dot]]:!size-[0.45em] uppercase',
  {
    variants: {
      variant: {
        solid: 'bg-foreground/15 text-foreground ring-1 ring-inset ring-foreground/6',
        default: 'bg-foreground/10 text-foreground ring-1 ring-inset ring-foreground/4',
        secondary:
          'bg-secondary/80 text-secondary-foreground ring-1 ring-inset ring-border/24 normal-case',
        accent: 'bg-foreground/5 text-foreground ring-1 ring-inset ring-foreground/2',
        destructive: 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/4',
        success:
          'bg-kortix-green/15 text-foreground ring-1 ring-inset ring-kortix-green/6 [&>svg]:text-kortix-green', // audit:allow badge hairline at 40% of the tint (owner, 2026-11-12)
        badgeSuccess:
          'bg-kortix-green/15 text-foreground ring-1 ring-inset ring-kortix-green/6 [&>svg]:text-kortix-green', // audit:allow badge hairline at 40% of the tint (owner, 2026-11-12)
        update:
          'bg-kortix-orange/15 text-foreground ring-1 ring-inset ring-kortix-orange/6 [&>svg]:text-kortix-orange', // audit:allow badge hairline at 40% of the tint (owner, 2026-11-12)
        kortix: 'bg-foreground/10 text-foreground ring-1 ring-inset ring-foreground/4',
        warning:
          'bg-kortix-orange/15 text-foreground ring-1 ring-inset ring-kortix-orange/6 [&>svg]:text-kortix-orange', // audit:allow badge hairline at 40% of the tint (owner, 2026-11-12)
        outline: 'bg-transparent text-foreground ring-1 ring-inset ring-border/40 normal-case',
        new: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/4',
        beta: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/4',
        highlight: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/4',
        info: 'bg-kortix-blue/15 text-foreground ring-1 ring-inset ring-kortix-blue/6 normal-case [&>svg]:text-kortix-blue', // audit:allow badge hairline at 40% of the tint (owner, 2026-11-12)
        muted: 'bg-muted/50 text-muted-foreground ring-1 ring-inset ring-muted/20 normal-case',
        transparent: 'bg-transparent text-foreground ring-0 normal-case',
        // The owner tier of the role badge hierarchy (decisions.md, R1).
        royal: 'bg-kortix-purple/15 text-foreground ring-1 ring-inset ring-kortix-purple/6 normal-case', // audit:allow badge hairline at 40% of the tint (owner, 2026-11-12)
      },
      size: {
        default: 'px-1.5',
        sm: '',
        xs: '',
        tabular: 'min-w-5 gap-0 px-1 tabular-nums tracking-normal',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'xs',
    },
  },
);

function Badge({
  className,
  variant = 'solid',
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
