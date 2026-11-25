/**
 * One QualiLoop test turn against the real agent: a QualiLoop conversation is
 * one Kortix session in the project `QUALILOOP_KORTIX_PROJECT_ID`, run as the
 * project's owner through the same session lifecycle a person's chat uses. The
 * first turn creates the session with the prompt; later turns go through the
 * durable prompt queue. The reply is the agent's text of the turn, read from
 * the session log once the turn ended, and the turn's trace goes to QualiLoop
 * before the reply returns (QualiLoop looks for it as soon as it has the reply).
 */
import { gzipSync } from 'node:zlib';
import { projectSessions, sessionTurns } from '@kortix/db';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import { db } from '../../shared/db';
import { projectsView } from '../../workspaces/rows';
import { readSessionLogPage } from '../session-log-read';
import {
  createSession,
  drainSessionLifecycleQueue,
  enqueueContinueSessionCommand,
  resolveProjectAutomationActor,
} from '../session-lifecycle';
import { buildTurnTrace, kortixSessionIdFor, type LogMessage } from './spans';

const SOURCE = 'system:qualiloop' as const;
/** Under QualiLoop's longest reply timeout (600 s). */
const TURN_TIMEOUT_MS = 570_000;
const POLL_MS = 1_000;
/** How long an ended turn may wait for its log to be stored. */
const LOG_WAIT_MS = 20_000;

export class QualiloopTurnError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The session's turn tokens so far: the turn this request starts is the one not among them. */
async function turnTokens(sessionId: string): Promise<string[]> {
  const rows = await db.select({ token: sessionTurns.turnToken }).from(sessionTurns).where(eq(sessionTurns.sessionId, sessionId));
  return rows.map((row) => row.token);
}

/**
 * The turn this request started, once it ended and its log is stored. Turns
 * are told apart by token, not by start time: `started_at` has microseconds
 * and a JS Date only milliseconds, so `> previous start` matched the previous turn.
 */
async function awaitTurnEnd(sessionId: string, before: string[], deadline: number): Promise<void> {
  let endedAt: number | null = null;
  while (Date.now() < deadline) {
    const rows = await db
      .select({ state: sessionTurns.state, endReason: sessionTurns.endReason, endError: sessionTurns.endError, logDurableAt: sessionTurns.logDurableAt })
      .from(sessionTurns)
      .where(before.length ? and(eq(sessionTurns.sessionId, sessionId), notInArray(sessionTurns.turnToken, before)) : eq(sessionTurns.sessionId, sessionId))
      .orderBy(desc(sessionTurns.startedAt))
      .limit(20);
    // A delivered prompt can leave an `abandoned` row beside the real turn: the agent is done when no turn is open.
    if (rows.length && rows.every((row) => row.state === 'ended')) {
      const turn = rows.find((row) => row.endReason === 'completed') ?? rows[0]!;
      if (turn.endReason === 'failed') {
        throw new QualiloopTurnError(`The agent's turn failed: ${turn.endError?.message ?? 'no detail'}`);
      }
      endedAt ??= Date.now();
      if (turn.logDurableAt || Date.now() - endedAt > LOG_WAIT_MS) return;
    }
    await sleep(POLL_MS);
  }
  throw new QualiloopTurnError(`The agent did not finish the turn within ${TURN_TIMEOUT_MS / 1000} s.`);
}

// ponytail: the last 100 log messages; a turn longer than that loses its first steps from the trace.
async function logTail(sessionId: string): Promise<LogMessage[]> {
  const page = await readSessionLogPage({ sessionId, threadId: null, beforeSeq: null, limit: 100 });
  return !page || page === 'unknown_thread' ? [] : page.messages.filter((m) => m.in_context !== false);
}

async function sendTrace(body: unknown): Promise<void> {
  const url = config.QUALILOOP_OTLP_TRACES_URL;
  const key = config.QUALILOOP_PROJECT_KEY;
  if (!url || !key) return;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'X-Project-Key': key },
      body: gzipSync(JSON.stringify(body)),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) logger.warn('[qualiloop] trace export refused', { status: response.status });
  } catch (error) {
    logger.warn('[qualiloop] trace export failed', { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function runQualiloopTurn(input: { conversationId: string; turnIndex: number; prompt: string }): Promise<string> {
  const startedAtMs = Date.now();
  const projectId = config.QUALILOOP_KORTIX_PROJECT_ID!;
  const [project] = await db.select().from(projectsView).where(eq(projectsView.projectId, projectId)).limit(1);
  if (!project) throw new QualiloopTurnError('QUALILOOP_KORTIX_PROJECT_ID names no project.');
  const userId = await resolveProjectAutomationActor(project.accountId);
  if (!userId) throw new QualiloopTurnError('The QualiLoop project has no owner to run as.');

  const sessionId = kortixSessionIdFor(projectId, input.conversationId);
  const [existing] = await db.select({ id: projectSessions.sessionId }).from(projectSessions)
    .where(eq(projectSessions.sessionId, sessionId)).limit(1);
  const before = existing ? await turnTokens(sessionId) : [];
  const lastSeq = existing ? Math.max(0, ...(await logTail(sessionId)).map((m) => m.seq)) : 0;

  if (!existing) {
    const created = await createSession({
      source: SOURCE,
      project,
      userId,
      requestingPrincipalType: 'human',
      body: { session_id: sessionId, name: `QualiLoop ${input.conversationId}`.slice(0, 120), initial_prompt: input.prompt },
      metadata: { qualiloop_conversation_id: input.conversationId },
      idempotencyKey: `qualiloop-create:${sessionId}`,
    });
    if (created.error) {
      throw new QualiloopTurnError(String(created.error.body?.error ?? created.error.body?.message ?? 'The session could not start.'));
    }
  } else {
    // One key per turn: a retried request of the same turn sends nothing twice.
    const idempotencyKey = `qualiloop-prompt:${sessionId}:${input.turnIndex}`;
    await enqueueContinueSessionCommand({
      source: SOURCE,
      projectId: project.projectId,
      accountId: project.accountId,
      sessionId,
      actorUserId: userId,
      text: input.prompt,
      idempotencyKey,
    });
    drainSessionLifecycleQueue({ idempotencyKey, burst: false }).catch(() => {});
  }

  await awaitTurnEnd(sessionId, before, startedAtMs + TURN_TIMEOUT_MS);
  const log = await logTail(sessionId);
  // The session's system prompt rides in a `context` message at the start: every model call of the turn saw it.
  const systemPrompt = log.find((m) => m.role === 'system')?.blocks.map((b) => (b.type === 'text' ? b.text : '')).join('') ?? null;
  const messages = log.filter((m) => m.seq > lastSeq && m.role !== 'system');
  const reply = messages
    .filter((m) => m.role === 'assistant')
    .map((m) => m.blocks.map((b) => (b.type === 'text' ? b.text : '')).join(''))
    .filter((text) => text.trim())
    .join('\n\n')
    .trim();

  await sendTrace(buildTurnTrace({
    conversationId: input.conversationId,
    turnIndex: input.turnIndex,
    input: input.prompt,
    output: reply,
    startedAtMs,
    endedAtMs: Date.now(),
    messages,
    systemPrompt,
    kortixSessionId: sessionId,
  }, config.INTERNAL_KORTIX_ENV));
  return reply;
}
