/**
 * Integration test (real local PostgreSQL): a turn the platform starts in a
 * Slack-started session answers the Slack thread.
 *
 * Only a Slack message opens a Slack turn row. A colleague's report starts a
 * turn with none, so its end found no row and its reply was dropped: prod,
 * 2026-11-28, a Slack session relayed four reports to the session page only,
 * and the thread stayed silent for 26 minutes.
 *
 * Real: the session, its chat thread, the turn ledger, the report's
 * `continue_session` row (`enqueueSessionNotice`), the `end` handler
 * (`settleTurnEnd`), the `answer` handler (`relayContent`), the dedup claims,
 * and the Slack Web API request body. Stubbed: the bot token read, the
 * forwarded reconcile, the push notifier and the drain kick. Slack is a fetch
 * double that records each call. `mock.module` is process-global: the
 * db-suites lane runs each file alone.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { chatThreads, projectSessions, sessionLifecycleCommands } from '@kortix/db';
import { and, eq, sql } from 'drizzle-orm';

const realInstall = await import('../channels/install-store');
mock.module('../channels/install-store', () => ({
  ...realInstall,
  loadSlackTokenForProject: async () => 'xoxb-test',
  ensureSlackBotId: async () => null,
}));
mock.module('../projects/session-lifecycle/forwarded-strand-reconcile', () => ({
  reconcileForwardedTurnsAtEnd: async () => undefined,
}));
const realPush = await import('../notifications/session-push');
mock.module('../notifications/session-push', () => ({ ...realPush, notifySessionEvent: async () => undefined }));
const realLifecycleDrain = await import('../projects/session-lifecycle/drain');
mock.module('../projects/session-lifecycle/drain', () => ({ ...realLifecycleDrain, drainSessionLifecycleQueue: async () => undefined }));
const realDrain = { ...(await import('../shared/drain')) };
let detached: Promise<unknown>[] = [];
mock.module('../shared/drain', () => ({
  ...realDrain,
  trackDetached: (work: Promise<unknown>) => {
    detached.push(work);
    realDrain.trackDetached(work);
  },
}));

const { db } = await import('../shared/db');
const { config } = await import('../config');
const { relayContent, settleTurnEnd } = await import('../projects/routes/turn-stream-handlers');
const { acceptSandboxTurn, beginSandboxTurn } = await import('../projects/sandbox-turn-lifecycle');
const { enqueueSessionNotice } = await import('../projects/session-notice-batch');
const { buildContinueSessionCommandValues } = await import('../projects/session-lifecycle/enqueue-commands');
const { bindChatThread } = await import('../channels/core/threads');
const { seedProject } = await import('./helpers/integration-fixtures');

const RUNTIME_SESSION = 'ses_root';
const TEAM = 'T0SYNTH';
const CHANNEL = 'C0SYNTH';
let project: Awaited<ReturnType<typeof seedProject>>;
let sessionId: string;
let threadTs: string;

// ─── Slack, as the network sees it ───────────────────────────────────────────
type SlackCall = { method: string; body: Record<string, unknown> };
let slackCalls: SlackCall[] = [];
/** Slack refuses every post while this is set (both the block post and its plain fallback). */
let slackRefusesPosts = false;
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(`${config.SLACK_API_URL}/`)) return realFetch(input, init);
    const method = url.slice(config.SLACK_API_URL.length + 1);
    const raw = typeof init?.body === 'string' ? init.body : '';
    const body = raw.startsWith('{') ? (JSON.parse(raw) as Record<string, unknown>) : Object.fromEntries(new URLSearchParams(raw));
    slackCalls.push({ method, body });
    const refused = slackRefusesPosts && method === 'chat.postMessage';
    return new Response(JSON.stringify(refused ? { ok: false, error: 'channel_not_found' } : { ok: true, ts: '1795884999.000100' }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});
const posts = () => slackCalls.filter((call) => call.method === 'chat.postMessage');
const postedText = (call: SlackCall) => JSON.stringify(call.body);

const responder = {
  json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
};

/** A session a Slack message started: `metadata.slack` and its bound thread, as `launchSlackSession` writes them. */
async function seedSlackSession(id: string, thread: string): Promise<void> {
  await db.insert(projectSessions).values({
    sessionId: id,
    accountId: project.account_id,
    projectId: project.project_id,
    branchName: `session/${id}`,
    status: 'running',
    metadata: { source: 'slack', slack: { team_id: TEAM, channel: CHANNEL, thread_ts: thread, user: 'U0SYNTH' } },
  });
  await db.execute(sql`
    INSERT INTO kortix.session_sandboxes (sandbox_id, session_id, account_id, project_id, status, external_id)
    VALUES (${id}::uuid, ${id}, ${project.account_id}::uuid, ${project.project_id}::uuid, 'active', ${`ext-${id}`})`);
}

/** A colleague's report waits for the session: the wire id the turn that reads it answers. */
async function colleagueReport(): Promise<string> {
  const key = `subagent-finished:${crypto.randomUUID()}:msg_child`;
  await enqueueSessionNotice({
    source: 'system:subagent-finished',
    projectId: project.project_id,
    accountId: project.account_id,
    sessionId,
    actorUserId: null,
    text: 'A background subagent you started has finished.',
    key,
  });
  const [row] = await db
    .select({ payload: sessionLifecycleCommands.payload })
    .from(sessionLifecycleCommands)
    .where(and(eq(sessionLifecycleCommands.sessionId, sessionId), eq(sessionLifecycleCommands.idempotencyKey, key)));
  return (row?.payload as { wireMessageId: string }).wireMessageId;
}

/** A prompt the person typed on another surface (the web). */
async function webPrompt(): Promise<string> {
  const wireMessageId = `msg_web_${crypto.randomUUID().slice(0, 8)}`;
  const values = buildContinueSessionCommandValues({
    source: 'ui',
    projectId: project.project_id,
    accountId: project.account_id,
    sessionId,
    actorUserId: null,
    text: 'What is the status?',
    idempotencyKey: `web:${wireMessageId}`,
    wireMessageId,
  });
  await db.insert(sessionLifecycleCommands).values(values);
  return wireMessageId;
}

/** The runtime accepted the prompt: the turn runs. */
async function runTurn(messageId: string): Promise<void> {
  const token = `tok-${messageId}`;
  const identity = { runtimeSessionId: RUNTIME_SESSION, messageId };
  await beginSandboxTurn({ sandboxId: sessionId }, { token, ...identity });
  expect(await acceptSandboxTurn({ sandboxId: sessionId }, token, identity)).toBe(true);
}

/** kortixd's `end` frame for the turn: its last message, or its failure. */
async function endTurn(
  messageId: string,
  end: { text?: string; error_code?: string; error_name?: string; error_message?: string; error_retryable?: boolean },
) {
  const status = end.error_code ? 'error' : 'idle';
  const response = await settleTurnEnd(
    responder,
    { kind: 'end', status, runtime_session_id: RUNTIME_SESSION, turn_message_id: messageId, ...end },
    {
      projectId: project.project_id,
      sessionId,
      childSession: false,
      turnStreamMetadata: {},
      turnStreamSession: { accountId: project.account_id, createdBy: null, origin: 'user' },
    },
  );
  await Promise.all(detached);
  return (await response.json()) as { ok: boolean; turn_completion: { outcome: string } };
}

beforeAll(async () => {
  project = await seedProject('slack-follow-up-turn-reply');
});

// No cleanup: the db-suites lane gives this file its own database and drops it.
beforeEach(async () => {
  detached = [];
  slackCalls = [];
  slackRefusesPosts = false;
  sessionId = crypto.randomUUID();
  threadTs = `1795882847.${Math.floor(Math.random() * 1e6)}`;
  await seedSlackSession(sessionId, threadTs);
  await bindChatThread({ platform: 'slack', workspaceId: TEAM, threadId: threadTs, projectId: project.project_id, sessionId });
});

describe('a turn no Slack message started answers its Slack thread', () => {
  test("a colleague's report: the turn's last message reaches the thread, once", async () => {
    const messageId = await colleagueReport();
    await runTurn(messageId);
    const end = await endTurn(messageId, { text: 'Engineering finished the fix: **19 of 19** tests pass.' });
    expect(end.turn_completion.outcome).toBe('closed');
    expect(end.ok).toBe(true);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body.channel).toBe(CHANNEL);
    expect(posts()[0]!.body.thread_ts).toBe(threadTs);
    expect(posts()[0]!.body.text).toBe('Engineering finished the fix: *19 of 19* tests pass.');

    // The daemon re-sends the same end: the thread already has the reply.
    await endTurn(messageId, { text: 'Engineering finished the fix: **19 of 19** tests pass.' });
    expect(posts()).toHaveLength(1);
  });

  test('a report turn that fails tells the thread why', async () => {
    const messageId = await colleagueReport();
    await runTurn(messageId);
    await endTurn(messageId, { error_code: 'credits', error_name: 'UnknownError', error_message: '402: insufficient credits' });
    expect(posts()).toHaveLength(1);
    expect(postedText(posts()[0]!)).toContain('out of credits');
  });

  test('a retryable failure is not the end of the report turn: nothing posts', async () => {
    const messageId = await colleagueReport();
    await runTurn(messageId);
    const end = await endTurn(messageId, { error_code: 'rate_limit', error_name: 'APIError', error_message: '429: slow down', error_retryable: true });
    expect(end.turn_completion.outcome).toBe('non_terminal');
    expect(posts()).toEqual([]);
  });

  test('a report turn the person stopped stays quiet', async () => {
    const messageId = await colleagueReport();
    await runTurn(messageId);
    await endTurn(messageId, { error_code: 'aborted', error_name: 'MessageAbortedError', error_message: 'Aborted' });
    expect(posts()).toEqual([]);
  });

  test('a report turn that answered with `slack send` posts nothing more at its end', async () => {
    const messageId = await colleagueReport();
    await runTurn(messageId);
    const sent = await relayContent(responder, { kind: 'answer', text: 'Engineering finished the fix.' }, sessionId);
    expect(await sent.json()).toEqual({ ok: true });
    await endTurn(messageId, { text: 'I posted the result in the thread.' });
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body.text).toBe('Engineering finished the fix.');
  });

  test('a `slack send` Slack refused leaves the reply to the turn end', async () => {
    const messageId = await colleagueReport();
    await runTurn(messageId);
    slackRefusesPosts = true;
    const sent = await relayContent(responder, { kind: 'answer', text: 'Engineering finished the fix.' }, sessionId);
    expect(await sent.json()).toEqual({ ok: false, reason: 'post_failed' });
    slackRefusesPosts = false;
    const before = posts().length;
    await endTurn(messageId, { text: 'Engineering finished the fix: 19 of 19 tests pass.' });
    expect(posts()).toHaveLength(before + 1);
    expect(posts().at(-1)!.body.text).toBe('Engineering finished the fix: 19 of 19 tests pass.');
  });

  test('a turn the person started on the web stays off the thread', async () => {
    const messageId = await webPrompt();
    await runTurn(messageId);
    const end = await endTurn(messageId, { text: 'Here is the status.' });
    expect(end.ok).toBe(false);
    expect(posts()).toEqual([]);
  });

  test('a thread that moved to another session hears nothing from this one', async () => {
    // The person switched agents: the thread now belongs to a new session.
    const successor = crypto.randomUUID();
    await seedSlackSession(successor, threadTs);
    await db
      .update(chatThreads)
      .set({ sessionId: successor })
      .where(and(eq(chatThreads.platform, 'slack'), eq(chatThreads.platformTeamId, TEAM), eq(chatThreads.threadId, threadTs)));
    const messageId = await colleagueReport();
    await runTurn(messageId);
    await endTurn(messageId, { text: 'Engineering finished the fix.' });
    expect(posts()).toEqual([]);
  });
});
