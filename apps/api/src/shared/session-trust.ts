/**
 * Session trust: whether everything a session has read came from people who
 * proved they belong to the workspace. A session that received a message from
 * anyone else (an email, a text, a chat user with no linked Kortix identity)
 * is `untrusted` until it ends: the text may be an instruction written to
 * hijack it. Trust only moves one way; approving one call does not restore it.
 *
 * Kept in `project_sessions.metadata.trust`. The agent rule gate and the
 * connector gateway read it on every call (`iam/kortix-rules.ts`).
 * Design: `.agents/skills/learnings/work/kortix-surface/README.md`, "Trust".
 */
import { projectSessions } from '@kortix/db';
import { eq, sql } from 'drizzle-orm';
import { db } from './db';

export type SessionTrust = 'principal' | 'untrusted';

/** Who sent a message into a session. Absent: a person in the app, or the session itself. */
export type SenderTrust = SessionTrust;

/** The trust a session row's metadata records. Anything but `untrusted` is principal. */
export function trustOfMetadata(metadata: unknown): SessionTrust {
  return (metadata as { trust?: unknown } | null)?.trust === 'untrusted' ? 'untrusted' : 'principal';
}

/** Mark a session untrusted, with why (`email`, `slack`, `parent_session`…). Idempotent; never reverts. */
export async function markSessionUntrusted(sessionId: string, reason: string): Promise<void> {
  await db
    .update(projectSessions)
    .set({
      metadata: sql`coalesce(${projectSessions.metadata}, '{}'::jsonb) || jsonb_build_object('trust', 'untrusted', 'trust_reason', coalesce(${projectSessions.metadata}->>'trust_reason', ${reason}::text))`,
    })
    .where(eq(projectSessions.sessionId, sessionId));
}

/** A session's trust now. A missing session reads as untrusted. */
export async function sessionTrust(sessionId: string): Promise<SessionTrust> {
  const [row] = await db
    .select({ metadata: projectSessions.metadata })
    .from(projectSessions)
    .where(eq(projectSessions.sessionId, sessionId))
    .limit(1);
  return row ? trustOfMetadata(row.metadata) : 'untrusted';
}
