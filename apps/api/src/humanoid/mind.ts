/**
 * The humanoid's own conversation ("the mind"): one session per humanoid
 * workspace that receives every event nobody addressed to it, as a digest.
 * It never waits; it decides to ignore, remember, or start a working thread.
 */
import { projectSessions } from '@kortix/db';
import { MY_KORTIX_AGENT_NAME } from '@kortix/shared';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';
import {
  createSession,
  enqueueSessionNotice,
  resolveProjectAutomationActor,
  sessionIsTombstoned,
} from '../projects/surface';
import { db } from '../shared/db';
import { projectsView } from '../workspaces/rows';
import type { HumanoidEventRow } from './events';
import { getHumanoidIdentity, updateHumanoidIdentity } from './identity';

export const HUMANOID_SESSION_SOURCE = 'system:humanoid' as const;
/** Session metadata key: `{ role: 'mind' | 'worker' }`. */
export const HUMANOID_METADATA_KEY = 'humanoid';

/** A session the mind can no longer use. */
const GONE_STATUSES = new Set(['failed']);

export function mindFirstPrompt(name: string): string {
  return [
    `You are ${name}. This is your own conversation: the events nobody addressed to you arrive here from your event log, a few at a time.`,
    'For each event decide: ignore it, remember what matters (kortix memory), or start a working thread for real work (the agent tool) and let it report back.',
    'Run `kortix humanoid show` now to read who you are and what you have, then wait for events.',
  ].join('\n\n');
}

/** One digest line for an event. Private events carry only who and where, never the body. Pure. */
export function digestLine(event: Pick<HumanoidEventRow, 'eventId' | 'type' | 'summary' | 'audience' | 'subject' | 'actor'>): string {
  const actor = (event.actor ?? {}) as { name?: string | null; id?: string | null };
  const who = actor.name ?? actor.id ?? 'someone';
  const body = event.audience.startsWith('private:') ? `a private ${event.type} from ${who}` : event.summary;
  const thread = event.subject ? ` [subject ${event.subject}]` : '';
  return `[event ${event.eventId}] ${event.type}: ${body}${thread}`;
}

async function liveSession(sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;
  const [row] = await db
    .select({ status: projectSessions.status, metadata: projectSessions.metadata })
    .from(projectSessions)
    .where(eq(projectSessions.sessionId, sessionId))
    .limit(1);
  return Boolean(row) && !GONE_STATUSES.has(String(row!.status)) && !sessionIsTombstoned(row!);
}

/**
 * The mind's session id, created on first use and recreated when the old one
 * is gone. Null when the workspace has no identity or no automation actor.
 */
export async function ensureHumanoidMind(projectId: string): Promise<string | null> {
  const identity = await getHumanoidIdentity(projectId);
  if (!identity) return null;
  if (await liveSession(identity.mindSessionId)) return identity.mindSessionId;

  const [project] = await db.select().from(projectsView).where(eq(projectsView.projectId, projectId)).limit(1);
  if (!project) return null;
  const actor = await resolveProjectAutomationActor(project.accountId);
  if (!actor) {
    logger.warn('[humanoid] no automation actor for the mind', { projectId });
    return null;
  }
  // A new key per replacement, so a recreate is not deduped against the dead session.
  const generation = identity.mindSessionId ?? 'first';
  const result = await createSession({
    source: HUMANOID_SESSION_SOURCE,
    project,
    userId: actor,
    requestingPrincipalType: 'human',
    body: { agent_name: MY_KORTIX_AGENT_NAME, initial_prompt: mindFirstPrompt(identity.name), space_id: null },
    metadata: { name: `${identity.name} · own conversation`, [HUMANOID_METADATA_KEY]: { role: 'mind' } },
    visibility: 'private',
    inSession: false,
    callerSessionId: null,
    idempotencyKey: `humanoid:mind:${projectId}:${generation}`,
  });
  const sessionId = result.row?.sessionId ?? result.sessionId ?? null;
  if (result.error || !sessionId) {
    logger.warn('[humanoid] the mind was not created', { projectId, status: result.error?.status });
    return null;
  }
  await updateHumanoidIdentity(projectId, { mindSessionId: sessionId });
  return sessionId;
}

/** Hand one event to the mind. Returns the mind's session id, or null when there is none. */
export async function digestToMind(event: HumanoidEventRow): Promise<string | null> {
  const mind = await ensureHumanoidMind(event.projectId);
  if (!mind) return null;
  const [project] = await db
    .select({ accountId: projectsView.accountId })
    .from(projectsView)
    .where(eq(projectsView.projectId, event.projectId))
    .limit(1);
  const actor = project ? await resolveProjectAutomationActor(project.accountId) : null;
  await enqueueSessionNotice({
    source: HUMANOID_SESSION_SOURCE,
    projectId: event.projectId,
    accountId: project!.accountId,
    sessionId: mind,
    actorUserId: actor,
    text: digestLine(event),
    key: `humanoid-event:${event.eventId}`,
  });
  return mind;
}
