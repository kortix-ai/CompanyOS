import { projectSpaces, serviceAccounts } from '@kortix/db';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../iam/actor';
import { accountMemberRow } from '../iam/membership-read';
import { db } from '../shared/db';
import { isHumanCaller } from '../connectors/share';
import { triggerReaderStanding, type TriggerReaderPrincipal } from './trigger-reader-policy';

/** Resolve the actual credential, never a launching human's standing. Fresh membership revokes on removal. */
export async function triggerReaderPrincipal(
  actor: Actor | null | undefined,
  projectId: string,
  bound: string | null,
): Promise<TriggerReaderPrincipal> {
  if (!actor) return { kind: 'none' };
  if (isHumanCaller({ credentialKind: actor.credential.kind, boundSessionId: bound })) {
    return { kind: 'human', member: (await accountMemberRow(actor.accountId, actor.userId)).length > 0 };
  }
  const credential = actor.credential;
  if (credential.kind !== 'agent_session' && credential.kind !== 'service_account') return { kind: 'none' };
  const [identity] = await db.select({ name: serviceAccounts.agentName }).from(serviceAccounts).where(and(
    eq(serviceAccounts.serviceAccountId, credential.serviceAccountId),
    eq(serviceAccounts.accountId, actor.accountId),
    eq(serviceAccounts.projectId, projectId),
    eq(serviceAccounts.status, 'active'),
  )).limit(1);
  return identity?.name ? { kind: 'agent', name: identity.name } : { kind: 'none' };
}

export async function mayReadTriggerSession(
  row: { metadata: Record<string, unknown> | null; spaceId: string | null; projectId: string },
  principal: TriggerReaderPrincipal,
): Promise<boolean> {
  const [space] = row.spaceId ? await db.select({ kind: projectSpaces.kind }).from(projectSpaces).where(and(
    eq(projectSpaces.projectId, row.projectId), eq(projectSpaces.spaceId, row.spaceId),
  )).limit(1) : [];
  return triggerReaderStanding({
    metadata: row.metadata,
    spaceKind: space?.kind ?? null,
    tombstoned: typeof row.metadata?.deletedAt === 'string',
  }, principal);
}
