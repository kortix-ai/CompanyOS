/**
 * The humanoid's API-facing services (flag `humanoid`): create, show, and its
 * event log as the routes serve it. Routes: projects/routes/humanoid.ts.
 */
import { humanoidEvents } from '@kortix/db';
import { eq, sql } from 'drizzle-orm';
import { listEmailInboxAccounts } from '../channels/email/installs';
import { createManagedProjectInbox } from '../channels/email/managed-inbox';
import { MY_KORTIX_AGENT_NAME } from '@kortix/shared';
import { db } from '../shared/db';
import type { HumanoidEventRow } from './events';
import { ensureHumanoidIdentity, getHumanoidIdentity, updateHumanoidIdentity, type HumanoidIdentityRow } from './identity';
import { ensureHumanoidMind } from './mind';

const NAME = /^[\p{L}][\p{L}\p{N} .'-]{0,39}$/u;

export class HumanoidInputError extends Error {
  readonly code = 'humanoid_invalid';
}

/** The name a humanoid goes by. Pure. */
export function humanoidName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!NAME.test(name)) throw new HumanoidInputError('name must be 1-40 letters, digits, spaces or . \' -, starting with a letter');
  return name;
}

/**
 * The humanoid's inbox: the project's inbox that routes to My Kortix, else the
 * first shared one. Written to the identity so every surface shows one address.
 */
export async function syncHumanoidEmail(identity: HumanoidIdentityRow): Promise<HumanoidIdentityRow> {
  const accounts = await listEmailInboxAccounts(identity.projectId);
  const inbox = accounts.find((a) => a.agentName === MY_KORTIX_AGENT_NAME)
    ?? accounts.find((a) => a.ownerType === 'project');
  if (!inbox || inbox.connectionId === identity.emailConnectionId) return identity;
  await updateHumanoidIdentity(identity.projectId, { emailConnectionId: inbox.connectionId, emailAddress: inbox.email });
  return { ...identity, emailConnectionId: inbox.connectionId, emailAddress: inbox.email };
}

/**
 * Create the humanoid (idempotent): its identity, its own address on the
 * managed domain when the workspace has no inbox for it yet, and its own
 * conversation. A part that fails is named in `last_error`; a second create
 * retries it.
 */
export async function createHumanoid(
  projectId: string,
  input: { name: string; role?: string | null; accountId: string; createdBy: string | null; webhookBaseUrl: string },
): Promise<HumanoidIdentityRow> {
  const identity = await syncHumanoidEmail(await ensureHumanoidIdentity(projectId, { name: input.name, role: input.role ?? null }));
  const problems: string[] = [];
  if (!identity.emailConnectionId) {
    try {
      await createManagedProjectInbox({
        projectId,
        accountId: input.accountId,
        name: identity.name,
        agentName: MY_KORTIX_AGENT_NAME,
        createdBy: input.createdBy,
        webhookBaseUrl: input.webhookBaseUrl,
      });
    } catch (err) {
      problems.push(`email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const mind = await ensureHumanoidMind(projectId);
  if (!mind) problems.push('its own conversation could not be started');
  await updateHumanoidIdentity(projectId, {
    status: mind ? 'ready' : 'failed',
    lastError: problems.length ? problems.join('; ').slice(0, 1000) : null,
  });
  return syncHumanoidEmail((await getHumanoidIdentity(projectId)) ?? identity);
}

export async function eventCounts(projectId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: humanoidEvents.dispatchStatus, n: sql<number>`count(*)::int` })
    .from(humanoidEvents)
    .where(eq(humanoidEvents.projectId, projectId))
    .groupBy(humanoidEvents.dispatchStatus);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function serializeIdentity(identity: HumanoidIdentityRow, counts: Record<string, number>) {
  return {
    name: identity.name,
    role: identity.role,
    status: identity.status,
    last_error: identity.lastError,
    email: identity.emailAddress,
    phone: identity.phoneNumber,
    browser_id: identity.browserId,
    drive_id: identity.driveId,
    mind_session_id: identity.mindSessionId,
    events: counts,
    created_at: identity.createdAt.toISOString(),
  };
}

/**
 * One event as the API serves it. A private event shows only its type and
 * time until the discretion check (phase 4) can tell who may read it.
 */
export function serializeEvent(row: HumanoidEventRow) {
  const hidden = row.audience.startsWith('private:');
  return {
    event_id: row.eventId,
    source: row.source,
    type: row.type,
    subject: row.subject,
    direction: row.direction,
    occurred_at: row.occurredAt.toISOString(),
    received_at: row.receivedAt.toISOString(),
    audience: hidden ? 'private' : row.audience,
    actor: hidden ? null : row.actor,
    summary: hidden ? `A private ${row.type}` : row.summary,
    payload: hidden ? null : row.payload,
    dispatch_status: row.dispatchStatus,
    routed_session_id: row.routedSessionId,
    routed_at: row.routedAt?.toISOString() ?? null,
    last_error: row.lastError,
  };
}
