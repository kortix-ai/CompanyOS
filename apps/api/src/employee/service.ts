/**
 * The employee's API-facing services (flag `employee`): create, show, and its
 * event log as the routes serve it. Routes: projects/routes/employee.ts.
 */
import { employeeEvents } from '@kortix/db';
import { eq, sql } from 'drizzle-orm';
import { listEmailInboxAccounts } from '../channels/email/installs';
import { db } from '../shared/db';
import type { EmployeeEventRow } from './events';
import { ensureEmployeeIdentity, getEmployeeIdentity, updateEmployeeIdentity, type EmployeeIdentityRow } from './identity';
import { ensureEmployeeMind } from './mind';

const NAME = /^[\p{L}][\p{L}\p{N} .'-]{0,39}$/u;

export class EmployeeInputError extends Error {
  readonly code = 'employee_invalid';
}

/** The name an employee goes by. Pure. */
export function employeeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!NAME.test(name)) throw new EmployeeInputError('name must be 1-40 letters, digits, spaces or . \' -, starting with a letter');
  return name;
}

/**
 * The employee's inbox: the project's inbox that routes to My Kortix, else the
 * first shared one. Written to the identity so every surface shows one address.
 */
export async function syncEmployeeEmail(identity: EmployeeIdentityRow): Promise<EmployeeIdentityRow> {
  const accounts = await listEmailInboxAccounts(identity.projectId);
  const inbox = accounts.find((a) => a.agentName === 'mykortix')
    ?? accounts.find((a) => a.ownerType === 'project');
  if (!inbox || inbox.connectionId === identity.emailConnectionId) return identity;
  await updateEmployeeIdentity(identity.projectId, { emailConnectionId: inbox.connectionId, emailAddress: inbox.email });
  return { ...identity, emailConnectionId: inbox.connectionId, emailAddress: inbox.email };
}

/** Create the employee (idempotent) and start its own conversation. */
export async function createEmployee(projectId: string, input: { name: string; role?: string | null }): Promise<EmployeeIdentityRow> {
  const identity = await ensureEmployeeIdentity(projectId, { name: input.name, role: input.role ?? null });
  const mind = await ensureEmployeeMind(projectId);
  await updateEmployeeIdentity(projectId, mind
    ? { status: 'ready', lastError: null }
    : { status: 'failed', lastError: 'its own conversation could not be started' });
  return syncEmployeeEmail((await getEmployeeIdentity(projectId)) ?? identity);
}

export async function eventCounts(projectId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: employeeEvents.dispatchStatus, n: sql<number>`count(*)::int` })
    .from(employeeEvents)
    .where(eq(employeeEvents.projectId, projectId))
    .groupBy(employeeEvents.dispatchStatus);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function serializeIdentity(identity: EmployeeIdentityRow, counts: Record<string, number>) {
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
export function serializeEvent(row: EmployeeEventRow) {
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
