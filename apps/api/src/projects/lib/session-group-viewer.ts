/**
 * The services half of Space access (`shared/session-group-access.ts` holds
 * the rules): the `session_groups` flag and account session oversight, which
 * `shared/` cannot read.
 */
import { projectSessions } from '@kortix/db';
import { and, eq } from 'drizzle-orm';
import { projectFeatureFlagEnabled } from '../../feature-flags/for-project';
import { hasAccountSessionOversight } from '../../iam/session-oversight';
import { db } from '../../shared/db';
import { canSeeGroup, ownerSeesGroup, type GroupViewer, sessionSharedThroughGroup, sharedGroupIdsFor } from '../../shared/session-group-access';

export async function groupViewerFor(userId: string, accountId: string): Promise<GroupViewer> {
  return { userId, oversight: await hasAccountSessionOversight(userId, accountId).catch(() => false) };
}

/** `sharedGroupIdsFor` while the project's `session_groups` flag is on; empty while it is off. */
export async function sharedGroupIdsWhileOn(projectId: string, userId: string): Promise<Set<string>> {
  if (!(await projectFeatureFlagEnabled(projectId, 'session_groups'))) return new Set();
  return sharedGroupIdsFor(projectId, userId);
}

/** The session is in a Space this person sees (or is a child of a session in one), with `session_groups` on. */
export async function sessionSharedThroughSpace(projectId: string, userId: string, sessionId: string): Promise<boolean> {
  if (!(await projectFeatureFlagEnabled(projectId, 'session_groups'))) return false;
  const [row] = await db
    .select({ groupId: projectSessions.groupId, parentSessionId: projectSessions.parentSessionId, metadata: projectSessions.metadata })
    .from(projectSessions)
    .where(and(eq(projectSessions.sessionId, sessionId), eq(projectSessions.projectId, projectId)))
    .limit(1);
  return row ? sessionSharedThroughGroup(projectId, userId, row) : false;
}

/**
 * The owner of a session filed in a Space still sees the Space (`ownerSeesGroup`).
 * A session no person started (`ownerId` null: a trigger, a backend caller)
 * has nobody to remove, so it keeps its Space. Account session oversight is
 * read only when membership does not already decide it.
 */
export async function sessionOwnerSeesGroup(
  group: { visibility: string; createdBy: string | null },
  ownerId: string | null,
  ownerIsMember: boolean,
  accountId: string | null,
  oversight: (userId: string, accountId: string) => Promise<boolean> = (userId, account) =>
    hasAccountSessionOversight(userId, account).catch(() => false),
): Promise<boolean> {
  return ownerSeesGroup(group, ownerId, ownerIsMember, async () => !!ownerId && !!accountId && (await oversight(ownerId, accountId)));
}

/**
 * May a turn of a session filed in a Space read the Space (its brief and
 * memory list)? Its owner must still see it (`sessionOwnerSeesGroup`), and so
 * must the person prompting the turn. A turn with no person behind it
 * (`prompterId` null: sandbox-authored, an automation) and the owner's own
 * turn take the owner rule alone.
 */
export async function turnSeesGroup(
  group: { visibility: string; createdBy: string | null },
  who: { ownerId: string | null; ownerIsMember: boolean; prompterId: string | null; prompterIsMember: boolean; accountId: string | null },
  oversight: (userId: string, accountId: string) => Promise<boolean> = (userId, account) =>
    hasAccountSessionOversight(userId, account).catch(() => false),
): Promise<boolean> {
  if (!(await sessionOwnerSeesGroup(group, who.ownerId, who.ownerIsMember, who.accountId, oversight))) return false;
  if (!who.prompterId || who.prompterId === who.ownerId) return true;
  return sessionOwnerSeesGroup(group, who.prompterId, who.prompterIsMember, who.accountId, oversight);
}
