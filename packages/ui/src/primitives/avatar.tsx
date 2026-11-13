'use client';

import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar';
import * as React from 'react';

import { cn } from '../lib/utils';

function Avatar({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: 'default' | 'sm' | 'lg';
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        // No overflow-hidden here: the image and the fallback clip themselves to the
        // root's corner, so an AvatarBadge can sit outside it.
        'group/avatar relative flex size-8 shrink-0 rounded-sm select-none data-[size=lg]:size-10 data-[size=sm]:size-6',
        className,
      )}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full rounded-[inherit] object-cover', className)} // audit:allow inherit: the image follows whatever corner the Avatar root has
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  delayMs,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & {
  /** Waits this long before showing the fallback, so a fast image never flashes it. */
  delayMs?: number;
}) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      delay={delayMs}
      className={cn(
        'bg-muted text-muted-foreground flex size-full items-center justify-center rounded-[inherit] text-sm group-data-[size=sm]/avatar:text-xs', // audit:allow inherit: the fallback follows the Avatar root's corner
        className,
      )}
      {...props}
    />
  );
}

const AVATAR_BADGE_TONE = {
  /** Present, running, healthy. */
  online: 'bg-kortix-green',
  /** Idle, waiting, needs attention soon. */
  away: 'bg-kortix-yellow',
  /** Do not disturb, failed, blocked. */
  busy: 'bg-kortix-red',
  /** No status meaning: a plain marker. */
  neutral: 'bg-muted-foreground',
} as const;

type AvatarBadgeTone = keyof typeof AVATAR_BADGE_TONE;

/**
 * A status dot on the avatar's bottom-right corner. It sits a quarter of its
 * width outside the corner, so it never eats into the picture, and wears a
 * ring in the page color so it reads as a separate mark.
 */
function AvatarBadge({
  className,
  tone = 'online',
  ...props
}: React.ComponentProps<'span'> & { tone?: AvatarBadgeTone }) {
  return (
    <span
      data-slot="avatar-badge"
      data-tone={tone}
      className={cn(
        AVATAR_BADGE_TONE[tone],
        'text-background ring-background absolute z-10 inline-flex items-center justify-center rounded-full ring-2 select-none',
        'group-data-[size=sm]/avatar:-right-0.5 group-data-[size=sm]/avatar:-bottom-0.5 group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:-right-0.5 group-data-[size=default]/avatar:-bottom-0.5 group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:-right-1 group-data-[size=lg]/avatar:-bottom-1 group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'group/avatar-group *:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'bg-muted text-muted-foreground ring-background relative flex size-8 shrink-0 items-center justify-center rounded-sm text-sm font-medium ring-2 group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };
