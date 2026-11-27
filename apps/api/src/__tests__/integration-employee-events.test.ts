/**
 * Integration test (real local PostgreSQL): the employee's event log.
 * An inbound event and its dispatch job commit together; a redelivery writes
 * nothing; outbound and ambient events are kept but never dispatched; events of
 * one subject dispatch one at a time, in order; the dispatcher delivers through
 * a registered channel or digests to the mind, and marks the event dead after
 * the last attempt; a workspace without the flag records nothing.
 */
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { accounts, employeeEvents, jobQueue, projects } from '@kortix/db';
import { and, eq } from 'drizzle-orm';

const { db } = await import('../shared/db');
const { claimJobs, completeJob } = await import('../shared/job-queue');
const events = await import('../employee/events');
const { dispatchEmployeeEvent, registerEmployeeDelivery, routeOf, setDigestForTests } = await import('../employee/dispatch');
const { serializeEvent } = await import('../employee/service');

const ACCOUNT = crypto.randomUUID();
const PLAIN_ACCOUNT = crypto.randomUUID();
const EMPLOYEE = crypto.randomUUID();
const PLAIN = crypto.randomUUID();

const jobsOf = (eventId: number) =>
  db.select().from(jobQueue).where(and(eq(jobQueue.queue, events.EMPLOYEE_DISPATCH_QUEUE), eq(jobQueue.jobKey, `event:${eventId}`)));
const rowOf = async (eventId: number) => (await db.select().from(employeeEvents).where(eq(employeeEvents.eventId, eventId)))[0]!;

function input(over: Partial<import('../employee/events').EmployeeEventInput> = {}) {
  return {
    projectId: EMPLOYEE,
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
    { accountId: ACCOUNT, name: 'employee-events-suite' },
    { accountId: PLAIN_ACCOUNT, name: 'employee-events-plain' },
  ]);
  await db.insert(projects).values([
    { projectId: EMPLOYEE, accountId: ACCOUNT, name: 'employee', repoUrl: 'https://example.test/e.git', metadata: { experimental: { employee: true } } },
    { projectId: PLAIN, accountId: PLAIN_ACCOUNT, name: 'plain', repoUrl: 'https://example.test/p.git', metadata: {} },
  ]);
});

afterAll(async () => {
  setDigestForTests(null);
  await db.delete(jobQueue).where(eq(jobQueue.queue, events.EMPLOYEE_DISPATCH_QUEUE));
  for (const accountId of [ACCOUNT, PLAIN_ACCOUNT]) {
    await db.delete(projects).where(eq(projects.accountId, accountId));
    await db.delete(accounts).where(eq(accounts.accountId, accountId));
  }
});

test('an inbound event commits with one ordered dispatch job; a redelivery writes nothing', async () => {
  const first = input();
  const a = await events.recordEmployeeEvent(first);
  expect(a.inserted).toBe(true);
  const b = await events.recordEmployeeEvent({ ...first, summary: 'a retry with other text' });
  expect(b).toEqual({ eventId: a.eventId, inserted: false });

  const row = await rowOf(a.eventId);
  expect(row.dispatchStatus).toBe('pending');
  expect(row.summary).toBe('Write the weekly report');
  const jobs = await jobsOf(a.eventId);
  expect(jobs.length).toBe(1);
  expect(jobs[0]!.orderKey).toBe(`${EMPLOYEE}:${first.subject}`);
  expect(jobs[0]!.orderSeq).toBe(a.eventId);
});

test('outbound and ambient events are kept, never dispatched', async () => {
  const out = await events.recordEmployeeEvent(input({ direction: 'out', type: 'email.message.sent' }));
  const ambient = await events.recordEmployeeEvent(input({ source: 'slack', type: 'slack.message.posted', dispatch: false }));
  for (const { eventId } of [out, ambient]) {
    expect((await rowOf(eventId)).dispatchStatus).toBe('recorded');
    expect((await jobsOf(eventId)).length).toBe(0);
  }
});

test('a workspace without the flag records nothing', async () => {
  const externalId = crypto.randomUUID();
  expect(await events.recordIfEmployee(input({ projectId: PLAIN, externalId }))).toBeNull();
  const rows = await db.select().from(employeeEvents).where(eq(employeeEvents.projectId, PLAIN));
  expect(rows.length).toBe(0);
  expect(await events.recordIfEmployee(input({ externalId }))).not.toBeNull();
});

test('events of one subject dispatch one at a time, in arrival order', async () => {
  const subject = `thread-${crypto.randomUUID()}`;
  const first = await events.recordEmployeeEvent(input({ subject }));
  const second = await events.recordEmployeeEvent(input({ subject }));
  expect(second.eventId).toBeGreaterThan(first.eventId);

  const claimed = (await claimJobs([events.EMPLOYEE_DISPATCH_QUEUE], 100, 60_000))
    .filter((j) => j.orderKey === `${EMPLOYEE}:${subject}`);
  expect(claimed.map((j) => j.orderSeq)).toEqual([first.eventId]);
  await completeJob(claimed[0]!);
  const next = (await claimJobs([events.EMPLOYEE_DISPATCH_QUEUE], 100, 60_000))
    .filter((j) => j.orderKey === `${EMPLOYEE}:${subject}`);
  expect(next.map((j) => j.orderSeq)).toEqual([second.eventId]);
});

test('the dispatcher delivers through a registered channel and records the session', async () => {
  const delivered: number[] = [];
  registerEmployeeDelivery('sms', async (event, run) => {
    expect(run.finalAttempt).toBe(false);
    delivered.push(event.eventId);
    return { sessionId: 'session-sms-thread' };
  });
  const { eventId } = await events.recordEmployeeEvent(input({ source: 'sms', type: 'sms.message.received' }));
  expect(await dispatchEmployeeEvent(eventId, false)).toBe('deliver');
  expect(delivered).toEqual([eventId]);
  const row = await rowOf(eventId);
  expect(row.dispatchStatus).toBe('routed');
  expect(row.routedSessionId).toBe('session-sms-thread');
  // A second run of the same job (a re-claim) does nothing.
  expect(await dispatchEmployeeEvent(eventId, false)).toBe('skip');
  expect(delivered).toEqual([eventId]);
});

test('an event no channel routes goes to the mind; the last failed attempt marks it dead', async () => {
  setDigestForTests(async () => 'session-mind');
  const digested = await events.recordEmployeeEvent(input());
  expect(await dispatchEmployeeEvent(digested.eventId, false)).toBe('digest');
  expect((await rowOf(digested.eventId)).dispatchStatus).toBe('digested');
  expect((await rowOf(digested.eventId)).routedSessionId).toBe('session-mind');

  setDigestForTests(async () => null);
  const failing = await events.recordEmployeeEvent(input());
  await expect(dispatchEmployeeEvent(failing.eventId, false)).rejects.toThrow('no conversation');
  expect((await rowOf(failing.eventId)).dispatchStatus).toBe('pending');
  await expect(dispatchEmployeeEvent(failing.eventId, true)).rejects.toThrow('no conversation');
  const dead = await rowOf(failing.eventId);
  expect(dead.dispatchStatus).toBe('dead');
  expect(dead.lastError).toContain('no conversation');
});

test('a private event shows only its type', async () => {
  const { eventId } = await events.recordEmployeeEvent(input({
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
  await expect(events.recordEmployeeEvent(input({ type: 'Not A Type' }))).rejects.toThrow('<source>.<object>.<verb>');
  await expect(events.recordEmployeeEvent(input({ audience: 'everyone' }))).rejects.toThrow('audience');
});

test('routing is a pure decision', () => {
  expect(routeOf({ direction: 'in', dispatchStatus: 'pending', source: 'email' }, true)).toBe('deliver');
  expect(routeOf({ direction: 'in', dispatchStatus: 'pending', source: 'connector' }, false)).toBe('digest');
  expect(routeOf({ direction: 'out', dispatchStatus: 'recorded', source: 'email' }, true)).toBe('skip');
  expect(routeOf({ direction: 'in', dispatchStatus: 'routed', source: 'email' }, true)).toBe('skip');
});

test('an email to an employee is logged, not routed; the dispatcher replays the inbox envelope', async () => {
  const { handleEmailEvent } = await import('../channels/email/session');
  const emailId = `email-${crypto.randomUUID()}`;
  const envelope = {
    id: emailId,
    source: 'email:inbox-1',
    type: 'email.message.received',
    time: '2026-11-27T10:00:00.000Z',
    subject: 'thread-1',
    projectId: EMPLOYEE,
    data: { inbox_id: 'inbox-1', thread_id: 'thread-1', email_id: emailId, from: 'sam@example.test', to: ['otto@example.test'], subject: 'Invoice' },
  };
  await handleEmailEvent(envelope, { finalAttempt: false });
  const [row] = await db.select().from(employeeEvents).where(and(eq(employeeEvents.projectId, EMPLOYEE), eq(employeeEvents.externalId, emailId)));
  expect(row!.source).toBe('email');
  expect(row!.subject).toBe('email:inbox-1:thread-1');
  expect(row!.summary).toBe('Email from sam@example.test: Invoice');
  expect(row!.dispatchStatus).toBe('pending');
  expect((row!.payload as { event: { id: string } }).event.id).toBe(emailId);
  expect((await jobsOf(row!.eventId)).length).toBe(1);
});

test('a Slack message maps to one row per message; a DM is private; an unaddressed one is not dispatched', async () => {
  const { slackEmployeeEvent } = await import('../channels/slack/employee');
  const mention = slackEmployeeEvent(EMPLOYEE, 'T1', { type: 'event_callback', event: { type: 'app_mention', channel: 'C1', user: 'U1', ts: '1795000000.000100', text: '<@B1> draft the update' } }, true)!;
  const asMessage = slackEmployeeEvent(EMPLOYEE, 'T1', { type: 'event_callback', event: { type: 'message', channel: 'C1', user: 'U1', ts: '1795000000.000100', text: '<@B1> draft the update' } }, true)!;
  expect(mention.externalId).toBe(asMessage.externalId);
  expect(mention.subject).toBe('slack:T1:C1:1795000000.000100');
  expect(mention.audience).toBe('team');
  expect(mention.dispatch).toBe(true);

  const dm = slackEmployeeEvent(EMPLOYEE, 'T1', { type: 'event_callback', event: { type: 'message', channel: 'D1', channel_type: 'im', user: 'U2', ts: '1795000001.000200', thread_ts: '1795000000.000050', text: 'about my raise' } }, true)!;
  expect(dm.audience).toBe('private:slack:T1:U2');
  expect(dm.subject).toBe('slack:T1:D1:1795000000.000050');

  const ambient = slackEmployeeEvent(EMPLOYEE, 'T1', { type: 'event_callback', event: { type: 'message', channel: 'C2', user: 'U3', ts: '1795000002.000300', text: 'lunch?' } }, false)!;
  expect(ambient.type).toBe('slack.message.posted');
  const recorded = await events.recordEmployeeEvent(ambient);
  expect((await rowOf(recorded.eventId)).dispatchStatus).toBe('recorded');
  expect(slackEmployeeEvent(EMPLOYEE, 'T1', { type: 'event_callback', event: { type: 'reaction_added' } }, false)).toBeNull();
});

test('a cron fire in an employee workspace is written to the log and taken up from there', async () => {
  const { fireGitTrigger, employeeFireSource } = await import('../projects/lib/trigger-fire');
  const [project] = await db.select().from(projects).where(eq(projects.projectId, EMPLOYEE));
  const key = `cron:daily-plan:${crypto.randomUUID()}`;
  const spec = { slug: 'daily-plan', name: 'Daily plan' } as unknown as Parameters<typeof fireGitTrigger>[0]['spec'];
  const result = await fireGitTrigger({ spec, project: project as never, payload: { slot: '2026-11-27T08:00:00Z' }, renderedPrompt: 'Plan the day.', source: 'cron', idempotencyKey: key });
  expect(result).toEqual({ status: 'queued', reason: 'prompt queued for delivery', deduped: false });

  const [row] = await db.select().from(employeeEvents).where(and(eq(employeeEvents.projectId, EMPLOYEE), eq(employeeEvents.externalId, key)));
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

  expect(employeeFireSource('event')).toBe('connector');
  expect(employeeFireSource('monitor')).toBe('webhook');
  expect(employeeFireSource('manual')).toBeNull();
});
