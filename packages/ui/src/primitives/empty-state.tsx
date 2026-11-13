'use client';

/**
 * Kortix <EmptyState> — centered empty view.
 *
 * Minimal. The card artwork (`EmptyArt`, D49), a one-line headline, an
 * optional one-line body, and up to two actions (primary + secondary). Name
 * the situation with `art` (`search`, `error`, `locked`, `done`, …) or pass
 * `icon` for any other noun on the fan. The catalogue and when to use each
 * kind: .agents/skills/kortix-design-system/references/empty-states.md.
 *
 *   <EmptyState
 *     art="search"
 *     title="No issues yet"
 *     description="Create your first issue with C, or press N in any tab."
 *     action={<Button>New issue</Button>}
 *   />
 */

import { EmptyArt, type EmptyArtKind } from './empty-art';
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

export interface EmptyStateProps {
  icon?: LucideIcon | IconMynauiType | IconType;
  /** The picture for the situation (D49). Without it: the fan with `icon`, or a document. */
  art?: EmptyArtKind;
  /** Custom artwork in place of `EmptyArt`. */
  media?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  size?: 'sm' | 'default';
}

export function EmptyState({
  icon: IconComponent,
  art,
  media,
  title,
  description,
  action,
  secondaryAction,
  size = 'default',
  className,
}: EmptyStateProps) {
  const maxW = size === 'sm' ? 'max-w-[240px]' : 'max-w-[320px]';

  return (
    <Empty className={cn('gap-4', className)}>
      <EmptyHeader className={cn('gap-0', maxW)}>
        <EmptyMedia className="mb-3">
          {media ?? <EmptyArt kind={art} icon={IconComponent} />}
        </EmptyMedia>
        <EmptyTitle className="text-foreground text-sm leading-5 font-medium">
          {title}
        </EmptyTitle>
        {description && (
          <EmptyDescription className="text-muted-foreground mt-1 text-xs leading-normal">
            {description}
          </EmptyDescription>
        )}
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
