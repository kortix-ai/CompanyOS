/**
 * The humanoid's event log (flag `humanoid`).
 *
 * Every inbound and outbound event of a humanoid workspace is written here
 * BEFORE anything acts on it. An inbound event commits together with its
 * dispatch job (`job_queue`, queue `humanoid.dispatch`, ordered per subject),
 * so an event is never acted on without a row and never lost after one.
 * Rows are kept while the workspace exists: they are its episodic memory.
 *
 * Design: .agents/skills/learnings/work/humanoid/README.md.
 */
import { humanoidEvents, jobQueue } from '@kortix/db';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { resolveFeatureFlag } from '../feature-flags/registry';
import { db } from '../shared/db';
import { jsonbSafeValue } from '../shared/jsonb-safe';
import { projectsView } from '../workspaces/rows';

export const HUMANOID_DISPATCH_QUEUE = 'humanoid.dispatch';

/** Larger payloads keep only their first part; the full body stays with its source. */
const PAYLOAD_MAX_CHARS = 64_000;
const SUMMARY_MAX_CHARS = 280;

export type HumanoidEventSource =
  | 'email' | 'slack' | 'teams' | 'telegram' | 'discord' | 'sms' | 'call'
  | 'connector' | 'webhook' | 'schedule' | 'goal' | 'session' | 'browser' | 'person';

export interface HumanoidEventActor {
  /** `member`, `external`, `humanoid` or `system`. */
  kind: 'member' | 'external' | 'humanoid' | 'system';
  /** A user id, an email address, a phone number or a platform user id. */
  id?: string | null;
  name?: string | null;
}

export interface HumanoidEventInput {
  projectId: string;
  source: HumanoidEventSource;
  /** `<source>.<object>.<verb>`. */
  type: string;
  /** The thread key. Null: the event stands alone. */
  subject: string | null;
  /** The upstream id; unique per project and source. */
  externalId: string;
  direction?: 'in' | 'out';
  occurredAt?: Date;
  actor?: HumanoidEventActor | null;
  /** `public`, `team` or `private:<person key>`. */
  audience?: string;
  summary: string;
  payload?: Record<string, unknown>;
  /** False: keep the event for awareness only (an ambient channel message); nothing dispatches it. Default true. */
  dispatch?: boolean;
}

export interface RecordedEvent {
  eventId: number;
  /** False when the event was already in the log (a redelivery). */
  inserted: boolean;
}

/** The project's `humanoid` flag. */
export async function humanoidOnForProject(projectId: string): Promise<boolean> {
  const [row] = await db
    .select({ metadata: projectsView.metadata })
    .from(projectsView)
    .where(eq(projectsView.projectId, projectId))
    .limit(1);
  return Boolean(row) && resolveFeatureFlag(row!.metadata, 'humanoid');
}

const AUDIENCE = /^(public|team|private:.+)$/;

/** Normalizes what an adapter passes. Pure. */
export function eventValues(input: HumanoidEventInput) {
  const audience = input.audience ?? 'team';
  if (!AUDIENCE.test(audience)) throw new Error(`humanoid event audience is not public, team or private:<person>: ${audience}`);
  if (!/^[a-z_]+\.[a-z_]+\.[a-z_]+$/.test(input.type)) throw new Error(`humanoid event type is not <source>.<object>.<verb>: ${input.type}`);
  const raw = jsonbSafeValue(input.payload ?? {}) as Record<string, unknown>;
  const text = JSON.stringify(raw);
  const payload = text.length > PAYLOAD_MAX_CHARS
    ? { truncated: true, size: text.length, head: text.slice(0, PAYLOAD_MAX_CHARS) }
    : raw;
  const summary = input.summary.replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX_CHARS) || input.type;
  const direction = input.direction ?? 'in';
  return {
    projectId: input.projectId,
    source: input.source,
    type: input.type,
    subject: input.subject,
    externalId: input.externalId,
    direction,
    occurredAt: input.occurredAt ?? new Date(),
    actor: (input.actor ?? null) as Record<string, unknown> | null,
    audience,
    summary,
    payload,
    // Outbound events are the humanoid's own actions, and ambient ones are for
    // awareness: neither needs a delivery.
    dispatchStatus: direction === 'out' || input.dispatch === false ? 'recorded' : 'pending',
  };
}

/** The order key of a subject: events of one subject are dispatched one at a time, in arrival order. */
export function dispatchOrderKey(projectId: string, subject: string | null, eventId: number): string {
  return `${projectId}:${subject ?? `event:${eventId}`}`;
}

/**
 * Write one event, and for an inbound event its dispatch job, in one
 * transaction. A redelivery (same project, source and external id) inserts
 * nothing and returns the existing event. Throws when the store fails, so a
 * webhook answers 5xx and its sender retries.
 */
export async function recordHumanoidEvent(input: HumanoidEventInput): Promise<RecordedEvent> {
  const values = eventValues(input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(humanoidEvents)
      .values(values)
      .onConflictDoNothing({ target: [humanoidEvents.projectId, humanoidEvents.source, humanoidEvents.externalId] })
      .returning({ eventId: humanoidEvents.eventId });
    if (!row) {
      const [existing] = await tx
        .select({ eventId: humanoidEvents.eventId })
        .from(humanoidEvents)
        .where(and(
          eq(humanoidEvents.projectId, values.projectId),
          eq(humanoidEvents.source, values.source),
          eq(humanoidEvents.externalId, values.externalId),
        ))
        .limit(1);
      return { eventId: existing!.eventId, inserted: false };
    }
    if (values.dispatchStatus === 'pending') {
      await tx
        .insert(jobQueue)
        .values({
          queue: HUMANOID_DISPATCH_QUEUE,
          jobKey: `event:${row.eventId}`,
          payload: { eventId: row.eventId, projectId: values.projectId },
          orderKey: dispatchOrderKey(values.projectId, values.subject, row.eventId),
          orderSeq: row.eventId,
        })
        .onConflictDoNothing({ target: [jobQueue.queue, jobQueue.jobKey] });
    }
    return { eventId: row.eventId, inserted: true };
  });
}

/**
 * Record when the project is a humanoid; otherwise do nothing. Returns null
 * when the flag is off, so the caller keeps its old path.
 */
export async function recordIfHumanoid(input: HumanoidEventInput): Promise<RecordedEvent | null> {
  if (!(await humanoidOnForProject(input.projectId))) return null;
  return recordHumanoidEvent(input);
}

export type HumanoidEventRow = typeof humanoidEvents.$inferSelect;

export async function getHumanoidEvent(eventId: number): Promise<HumanoidEventRow | null> {
  const [row] = await db.select().from(humanoidEvents).where(eq(humanoidEvents.eventId, eventId)).limit(1);
  return row ?? null;
}

export async function markEventDispatched(
  eventId: number,
  status: 'routed' | 'digested' | 'dead',
  opts: { sessionId?: string | null; error?: string | null } = {},
): Promise<void> {
  await db
    .update(humanoidEvents)
    .set({
      dispatchStatus: status,
      routedSessionId: opts.sessionId ?? null,
      routedAt: sql`now()`,
      lastError: opts.error ?? null,
    })
    .where(eq(humanoidEvents.eventId, eventId));
}

/** Newest first, one page. `before`: an event id, for the next page. */
export async function listHumanoidEvents(
  projectId: string,
  opts: { before?: number; limit?: number; subject?: string; source?: string } = {},
): Promise<HumanoidEventRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where = [eq(humanoidEvents.projectId, projectId)];
  if (opts.before) where.push(lt(humanoidEvents.eventId, opts.before));
  if (opts.subject) where.push(eq(humanoidEvents.subject, opts.subject));
  if (opts.source) where.push(eq(humanoidEvents.source, opts.source));
  return db
    .select()
    .from(humanoidEvents)
    .where(and(...where))
    .orderBy(desc(humanoidEvents.eventId))
    .limit(limit);
}
