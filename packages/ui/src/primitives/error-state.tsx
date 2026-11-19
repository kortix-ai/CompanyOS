'use client';

/**
 * Kortix <ErrorState> — centered error view.
 *
 * Minimal. An icon, a one-line headline, an optional body, and up to two
 * actions (primary + secondary). A calm failure moment — not an alarm bell.
 *
 * Drawn exactly as `EmptyState` (the `EmptyArt` card stack, the same title
 * and spacing) with the glyph in `kortix-red`, so a page reads the same
 * whether its list failed or is empty (D14). It had its own red tile and a
 * larger title: Skills (error) beside Drives (empty) looked like two
 * products (2026-11-08).
 *
 *   <ErrorState
 *     title="Failed to load"
 *     description={error.message}
 *     action={<Button variant="outline" size="sm" onClick={refetch}>Retry</Button>}
 *   />
 */

import { EmptyArt } from './empty-art';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './empty';
import { cn } from '../lib/utils';
import {
  type Icon as IconMynauiType,
  type Icon as IconType,
  type Icon as LucideIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

export interface ErrorStateProps {
  icon?: LucideIcon | IconMynauiType | IconType;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  size?: 'sm' | 'default';
}

export function ErrorState({
  icon: IconComponent,
  title,
  description,
  action,
  secondaryAction,
  size = 'default',
  className,
}: ErrorStateProps) {
  const maxW = size === 'sm' ? 'max-w-[240px]' : 'max-w-[320px]';

  return (
    <Empty className={cn('gap-4', className)}>
      <EmptyHeader className={cn('gap-0', maxW)}>
        <EmptyMedia className="mb-3">
          {/* The `error` picture (D49); a caller's own icon still lands on the fan, in red. */}
          {IconComponent ? (
            <EmptyArt icon={IconComponent} glyphClassName="text-kortix-red" />
          ) : (
            <EmptyArt kind="error" />
          )}
        </EmptyMedia>
        <EmptyTitle className="text-foreground text-sm leading-5 font-medium">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-muted-foreground mt-1 text-xs leading-normal">{description}</EmptyDescription>}
      </EmptyHeader>
      {(action || secondaryAction) && (
        <EmptyContent className="flex-row justify-center gap-2">
          {action}
          {secondaryAction}
        </EmptyContent>
      )}
    </Empty>
  );
}
