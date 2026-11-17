'use client';

import { useParams } from 'next/navigation';

import { SpaceDetailPage } from '@kortix/ui/workspace/session-spaces/space-detail-page';

/**
 * /workspaces/[id]/space/[groupId] — one space (session group, flag
 * `session_groups`): start a session in it, its sessions, what it is for and
 * its Files folder. The page renders the feature gate while the flag is off.
 */
export default function WorkspaceSpacePage() {
  const { id, groupId } = useParams<{ id: string; groupId: string }>();
  return <SpaceDetailPage projectId={id} groupId={decodeURIComponent(groupId)} />;
}
