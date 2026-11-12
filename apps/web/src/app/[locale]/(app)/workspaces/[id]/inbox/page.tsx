import { redirect } from 'next/navigation';

import { notificationsRedirectTarget } from './notifications-redirect';
import { WorkspaceInbox } from '@kortix/ui/workspace/inbox/workspace-inbox';

/**
 * /workspaces/[id]/inbox — the workspace's Review queue beside the workspace
 * sidebar (KRTX-4799). Notifications are the person's, across every
 * workspace, so they are not a view here: a `?view=notifications` bookmark
 * redirects to the person's Inbox page (`/inbox`).
 */
export default async function WorkspaceInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const target = notificationsRedirectTarget(typeof view === 'string' ? view : null);
  if (target) redirect(target);
  return <WorkspaceInbox projectId={id} />;
}
