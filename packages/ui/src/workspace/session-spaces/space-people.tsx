'use client';

import type { ProjectSessionGroup } from '@kortix/sdk';
import { listProjectAccess } from '@kortix/sdk';
import { contract, qk } from '@kortix/sdk/react';
import { LockSimpleIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';

import { useTranslations } from '../../i18n';
import { cn } from '../../lib/utils';
import { UserAvatar } from '../../primitives/user-avatar';

/** Who sees a space: everyone in the workspace, its creator alone, or its creator and the people it is shared with. */
export type SpaceAudience = { kind: 'everyone' } | { kind: 'private' } | { kind: 'people'; ids: string[] };

export function spaceAudience(space: ProjectSessionGroup): SpaceAudience {
  if (space.visibility === 'project') return { kind: 'everyone' };
  const members = space.member_ids ?? [];
  if (members.length === 0) return { kind: 'private' };
  return { kind: 'people', ids: [space.created_by, ...members].filter((id): id is string => !!id) };
}

/** The audience in words: "Everyone in this workspace", "Only you", "Shared with 3 people". */
export function useSpaceAudienceLabel(space: ProjectSessionGroup): string {
  const t = useTranslations('sessionSpaces');
  const audience = spaceAudience(space);
  if (audience.kind === 'everyone') return t('visibility');
  if (audience.kind === 'private') return space.can_manage === true ? t('onlyYou') : t('private');
  return t('sharedWith', { count: audience.ids.length - 1 });
}

/** One person of the workspace as the avatars draw them. */
export interface WorkspacePerson {
  email: string;
  /** Their profile's display name; null when they set none. */
  name: string | null;
  avatarUrl: string | null;
}

/** The workspace's people by id, for avatars: email, name and picture. A viewer who may not read the list gets an empty map. */
export function useWorkspacePeople(projectId: string, enabled: boolean): Map<string, WorkspacePerson> {
  const access = useQuery({
    queryKey: qk.project.access(projectId),
    queryFn: () => listProjectAccess(projectId),
    enabled,
    retry: false,
    ...contract('inventory'),
  });
  const people = new Map<string, WorkspacePerson>();
  for (const member of access.data?.members ?? []) {
    if (!member.email) continue;
    people.set(member.user_id, { email: member.email, name: member.name?.trim() || null, avatarUrl: member.avatar_url ?? null });
  }
  return people;
}

/**
 * Who sees the space, drawn small: up to `max` avatars and "+N", the people
 * glyph for the whole workspace, a lock for its creator alone. A viewer who
 * may not read the people list sees the count beside the people glyph, never
 * a "?" avatar.
 */
export function SpaceAudienceMark({ projectId, space, max = 4, className }: { projectId: string; space: ProjectSessionGroup; max?: number; className?: string }) {
  const audience = spaceAudience(space);
  const people = useWorkspacePeople(projectId, audience.kind === 'people');
  if (audience.kind === 'everyone') return <UsersThreeIcon aria-hidden className={cn('text-muted-foreground size-4 shrink-0', className)} />;
  if (audience.kind === 'private') return <LockSimpleIcon aria-hidden className={cn('text-muted-foreground size-4 shrink-0', className)} />;
  const shown = audience.ids.slice(0, max);
  if (!shown.every((id) => people.has(id))) {
    return (
      <span aria-hidden className={cn('text-muted-foreground flex items-center gap-1 text-xs tabular-nums', className)}>
        <UsersThreeIcon className="size-4 shrink-0" />
        {audience.ids.length}
      </span>
    );
  }
  return (
    <span aria-hidden className={cn('flex items-center', className)}>
      {shown.map((id, index) => {
        const person = people.get(id)!;
        return (
          <span key={id} className={cn('ring-background rounded-sm ring-2', index > 0 && '-ml-1.5')}>
            <UserAvatar email={person.email} name={person.name ?? person.email} avatarUrl={person.avatarUrl} colorKey={id} size="xs" />
          </span>
        );
      })}
      {audience.ids.length > max ? <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">+{audience.ids.length - max}</span> : null}
    </span>
  );
}
