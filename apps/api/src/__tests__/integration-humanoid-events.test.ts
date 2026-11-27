/**
 * Integration test (real local PostgreSQL): the humanoid's event log.
 * An inbound event and its dispatch job commit together; a redelivery writes
 * nothing; outbound and ambient events are kept but never dispatched; events of
 * one subject dispatch one at a time, in order; the dispatcher delivers through
 * a registered channel or digests to the mind, and marks the event dead after
 * the last attempt; a workspace without the flag records nothing.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { accounts, humanoidEvents, jobQueue, projects } from '@kortix/db';
import { and, eq } from 'drizzle-orm';

const { db } = await import('../shared/db');
const { claimJobs, completeJob } = await import('../shared/job-queue');
const events = await import('../humanoid/events');
const { dispatchHumanoidEvent, registerHumanoidDelivery, routeOf, setDigestForTests } = await import('../humanoid/dispatch');
const { serializeEvent } = await import('../humanoid/service');

const ACCOUNT = crypto.randomUUID();
const PLAIN_ACCOUNT = crypto.randomUUID();
const HUMANOID = crypto.randomUUID();
const PLAIN = crypto.randomUUID();

const jobsOf = (eventId: number) =>
  db.select().from(jobQueue).where(and(eq(jobQueue.queue, events.HUMANOID_DISPATCH_QUEUE), eq(jobQueue.jobKey, `event:${eventId}`)));
const rowOf = async (eventId: number) => (await db.select().from(humanoidEvents).where(eq(humanoidEvents.eventId, eventId)))[0]!;

function input(over: Partial<import('../humanoid/events').HumanoidEventInput> = {}) {
  return {
    projectId: HUMANOID,
    source: 'person' as const,
    type: 'person.task.assigned',
    subject: `subject-${crypto.randomUUID()}`,
    externalId: crypto.randomUUID(),
    summary: 'Write the weekly report',
    ...over,
  };
}

beforeAll(async () => {
  await db.insert(accounts).values([
    { accountId: ACCOUNT, name: 'humanoid-events-suite' },
    { accountId: PLAIN_ACCOUNT, name: 'humanoid-events-plain' },
  ]);
  await db.insert(projects).values([
    { projectId: HUMANOID, accountId: ACCOUNT, name: 'humanoid', repoUrl: 'https://example.test/e.git', metadata: { experimental: { humanoid: true } } },
    { projectId: PLAIN, accountId: PLAIN_ACCOUNT, name: 'plain', repoUrl: 'https://example.test/p.git', metadata: {} },
  ]);
});

afterAll(async () => {
  setDigestForTests(null);
  await db.delete(jobQueue).where(eq(jobQueue.queue, events.HUMANOID_DISPATCH_QUEUE));
  for (const accountId of [ACCOUNT, PLAIN_ACCOUNT]) {
    await db.delete(projects).where(eq(projects.accountId, accountId));
    await db.delete(accounts).where(eq(accounts.accountId, accountId));
  }
});

test('an inbound event commits with one ordered dispatch job; a redelivery writes nothing', async () => {
  const first = input();
  const a = await events.recordHumanoidEvent(first);
  expect(a.inserted).toBe(true);
  const b = await events.recordHumanoidEvent({ ...first, summary: 'a retry with other text' });
  expect(b).toEqual({ eventId: a.eventId, inserted: false });

  const row = await rowOf(a.eventId);
  expect(row.dispatchStatus).toBe('pending');
  expect(row.summary).toBe('Write the weekly report');
  const jobs = await jobsOf(a.eventId);
  expect(jobs.length).toBe(1);
  expect(jobs[0]!.orderKey).toBe(`${HUMANOID}:${first.subject}`);
  expect(jobs[0]!.orderSeq).toBe(a.eventId);
});

test('outbound and ambient events are kept, never dispatched', async () => {
  const out = await events.recordHumanoidEvent(input({ direction: 'out', type: 'email.message.sent' }));
  const ambient = await events.recordHumanoidEvent(input({ source: 'slack', type: 'slack.message.posted', dispatch: false }));
  for (const { eventId } of [out, ambient]) {
    expect((await rowOf(eventId)).dispatchStatus).toBe('recorded');
    expect((await jobsOf(eventId)).length).toBe(0);
  }
});

test('a workspace without the flag records nothing', async () => {
  const externalId = crypto.randomUUID();
  expect(await events.recordIfHumanoid(input({ projectId: PLAIN, externalId }))).toBeNull();
  const rows = await db.select().from(humanoidEvents).where(eq(humanoidEvents.projectId, PLAIN));
  expect(rows.length).toBe(0);
  expect(await events.recordIfHumanoid(input({ externalId }))).not.toBeNull();
});

test('events of one subject dispatch one at a time, in arrival order', async () => {
  const subject = `thread-${crypto.randomUUID()}`;
  const first = await events.recordHumanoidEvent(input({ subject }));
  const second = await events.recordHumanoidEvent(input({ subject }));
  expect(second.eventId).toBeGreaterThan(first.eventId);

  const claimed = (await claimJobs([events.HUMANOID_DISPATCH_QUEUE], 100, 60_000))
    .filter((j) => j.orderKey === `${HUMANOID}:${subject}`);
  expect(claimed.map((j) => j.orderSeq)).toEqual([first.eventId]);
  await completeJob(claimed[0]!);
  const next = (await claimJobs([events.HUMANOID_DISPATCH_QUEUE], 100, 60_000))
    .filter((j) => j.orderKey === `${HUMANOID}:${subject}`);
  expect(next.map((j) => j.orderSeq)).toEqual([second.eventId]);
});

test('the dispatcher delivers through a registered channel and records the session', async () => {
  const delivered: number[] = [];
  registerHumanoidDelivery('sms', async (event, run) => {
    expect(run.finalAttempt).toBe(false);
    delivered.push(event.eventId);
    return { sessionId: 'session-sms-thread' };
  });
  const { eventId } = await events.recordHumanoidEvent(input({ source: 'sms', type: 'sms.message.received' }));
  expect(await dispatchHumanoidEvent(eventId, false)).toBe('deliver');
  expect(delivered).toEqual([eventId]);
  const row = await rowOf(eventId);
  expect(row.dispatchStatus).toBe('routed');
  expect(row.routedSessionId).toBe('session-sms-thread');
  // A second run of the same job (a re-claim) does nothing.
  expect(await dispatchHumanoidEvent(eventId, false)).toBe('skip');
  expect(delivered).toEqual([eventId]);
});

test('an event no channel routes goes to the mind; the last failed attempt marks it dead', async () => {
  setDigestForTests(async () => 'session-mind');
  const digested = await events.recordHumanoidEvent(input());
  expect(await dispatchHumanoidEvent(digested.eventId, false)).toBe('digest');
  expect((await rowOf(digested.eventId)).dispatchStatus).toBe('digested');
  expect((await rowOf(digested.eventId)).routedSessionId).toBe('session-mind');

  setDigestForTests(async () => null);
  const failing = await events.recordHumanoidEvent(input());
  await expect(dispatchHumanoidEvent(failing.eventId, false)).rejects.toThrow('no conversation');
  expect((await rowOf(failing.eventId)).dispatchStatus).toBe('pending');
  await expect(dispatchHumanoidEvent(failing.eventId, true)).rejects.toThrow('no conversation');
  const dead = await rowOf(failing.eventId);
  expect(dead.dispatchStatus).toBe('dead');
  expect(dead.lastError).toContain('no conversation');
});

test('a private event shows only its type', async () => {
  const { eventId } = await events.recordHumanoidEvent(input({
    source: 'slack',
    type: 'slack.message.addressed',
    audience: 'private:slack:T1:U1',
    summary: 'Slack DM: my salary question',
    actor: { kind: 'member', id: 'slack:T1:U1' },
  }));
  const shown = serializeEvent(await rowOf(eventId));
  expect(shown.audience).toBe('private');
  expect(shown.summary).toBe('A private slack.message.addressed');
  expect(shown.actor).toBeNull();
  expect(shown.payload).toBeNull();
});

test('a bad type or audience is refused before anything is written', async () => {
  await expect(events.recordHumanoidEvent(input({ type: 'Not A Type' }))).rejects.toThrow('<source>.<object>.<verb>');
  await expect(events.recordHumanoidEvent(input({ audience: 'everyone' }))).rejects.toThrow('audience');
});

test('routing is a pure decision', () => {
  expect(routeOf({ direction: 'in', dispatchStatus: 'pending', source: 'email' }, true)).toBe('deliver');
  expect(routeOf({ direction: 'in', dispatchStatus: 'pending', source: 'connector' }, false)).toBe('digest');
  expect(routeOf({ direction: 'out', dispatchStatus: 'recorded', source: 'email' }, true)).toBe('skip');
  expect(routeOf({ direction: 'in', dispatchStatus: 'routed', source: 'email' }, true)).toBe('skip');
});

test('an email to a humanoid is logged, not routed; the dispatcher replays the inbox envelope', async () => {
  const { handleEmailEvent } = await import('../channels/email/session');
  const emailId = `email-${crypto.randomUUID()}`;
  const envelope = {
    id: emailId,
    source: 'email:inbox-1',
    type: 'email.message.received',
    time: '2026-11-27T10:00:00.000Z',
    subject: 'thread-1',
    projectId: HUMANOID,
    data: { inbox_id: 'inbox-1', thread_id: 'thread-1', email_id: emailId, from: 'sam@example.test', to: ['otto@example.test'], subject: 'Invoice' },
  };
  await handleEmailEvent(envelope, { finalAttempt: false });
  const [row] = await db.select().from(humanoidEvents).where(and(eq(humanoidEvents.projectId, HUMANOID), eq(humanoidEvents.externalId, emailId)));
  expect(row!.source).toBe('email');
  expect(row!.subject).toBe('email:inbox-1:thread-1');
  expect(row!.summary).toBe('Email from sam@example.test: Invoice');
  expect(row!.dispatchStatus).toBe('pending');
  expect((row!.payload as { event: { id: string } }).event.id).toBe(emailId);
  expect((await jobsOf(row!.eventId)).length).toBe(1);
});

test('a Slack message maps to one row per message; a DM is private; an unaddressed one is not dispatched', async () => {
  const { slackHumanoidEvent } = await import('../channels/slack/humanoid');
  const mention = slackHumanoidEvent(HUMANOID, 'T1', { type: 'event_callback', event: { type: 'app_mention', channel: 'C1', user: 'U1', ts: '1795000000.000100', text: '<@B1> draft the update' } }, true)!;
  const asMessage = slackHumanoidEvent(HUMANOID, 'T1', { type: 'event_callback', event: { type: 'message', channel: 'C1', user: 'U1', ts: '1795000000.000100', text: '<@B1> draft the update' } }, true)!;
  expect(mention.externalId).toBe(asMessage.externalId);
  expect(mention.subject).toBe('slack:T1:C1:1795000000.000100');
  expect(mention.audience).toBe('team');
  expect(mention.dispatch).toBe(true);

  const dm = slackHumanoidEvent(HUMANOID, 'T1', { type: 'event_callback', event: { type: 'message', channel: 'D1', channel_type: 'im', user: 'U2', ts: '1795000001.000200', thread_ts: '1795000000.000050', text: 'about my raise' } }, true)!;
  expect(dm.audience).toBe('private:slack:T1:U2');
  expect(dm.subject).toBe('slack:T1:D1:1795000000.000050');

  const ambient = slackHumanoidEvent(HUMANOID, 'T1', { type: 'event_callback', event: { type: 'message', channel: 'C2', user: 'U3', ts: '1795000002.000300', text: 'lunch?' } }, false)!;
  expect(ambient.type).toBe('slack.message.posted');
  const recorded = await events.recordHumanoidEvent(ambient);
  expect((await rowOf(recorded.eventId)).dispatchStatus).toBe('recorded');
  expect(slackHumanoidEvent(HUMANOID, 'T1', { type: 'event_callback', event: { type: 'reaction_added' } }, false)).toBeNull();
});

test('a cron fire in a humanoid workspace is written to the log and taken up from there', async () => {
  const { fireGitTrigger, humanoidFireSource } = await import('../projects/lib/trigger-fire');
  const [project] = await db.select().from(projects).where(eq(projects.projectId, HUMANOID));
  const key = `cron:daily-plan:${crypto.randomUUID()}`;
  const spec = { slug: 'daily-plan', name: 'Daily plan' } as unknown as Parameters<typeof fireGitTrigger>[0]['spec'];
  const result = await fireGitTrigger({ spec, project: project as never, payload: { slot: '2026-11-27T08:00:00Z' }, renderedPrompt: 'Plan the day.', source: 'cron', idempotencyKey: key });
  expect(result).toEqual({ status: 'queued', reason: 'prompt queued for delivery', deduped: false });

  const [row] = await db.select().from(humanoidEvents).where(and(eq(humanoidEvents.projectId, HUMANOID), eq(humanoidEvents.externalId, key)));
  expect(row!.source).toBe('schedule');
  expect(row!.type).toBe('schedule.trigger.fired');
  expect(row!.subject).toBe('trigger:daily-plan');
  expect(row!.dispatchStatus).toBe('pending');
  const fire = (row!.payload as { fire: { renderedPrompt: string; idempotencyKey: string } }).fire;
  expect(fire).toMatchObject({ renderedPrompt: 'Plan the day.', idempotencyKey: key });
  expect((await jobsOf(row!.eventId)).length).toBe(1);

  // The same slot fired twice is one event.
  const again = await fireGitTrigger({ spec, project: project as never, payload: {}, renderedPrompt: 'Plan the day.', source: 'cron', idempotencyKey: key });
  expect(again.deduped).toBe(true);

  expect(humanoidFireSource('event')).toBe('connector');
  expect(humanoidFireSource('monitor')).toBe('webhook');
  expect(humanoidFireSource('manual')).toBeNull();
});
