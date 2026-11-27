/**
 * `kortix_events`: the workspace's event ledger (`humanoid/events.ts`) as a
 * connector, so every agent reads the same episodic memory: what arrived,
 * from whom, when. `wait_for` blocks until a matching event lands: the
 * verification code a sign-up emails, the reply a person sends.
 *
 * Only events for the whole team are shown (`audience: team`). The ledger
 * keeps an email's sender and subject; its body is read from the inbox when
 * asked (`channels/email/session.ts` `loadReceivedEmail`), never copied.
 */
import { and, desc, eq, gte, ilike, or } from 'drizzle-orm';
import { humanoidEvents } from '@kortix/db';
import { db } from '../../shared/db';
import { codesIn } from './phone';
import { type AgentTool, i, optInt, optStr, READ, s, schema, ToolInputError } from './tool';

export interface LedgerEvent {
  eventId: number;
  source: string;
  type: string;
  subject: string | null;
  occurredAt: Date;
  actor: Record<string, unknown> | null;
  summary: string;
  payload: Record<string, unknown>;
}

/** What the tools read. Tests replace it. */
export interface LedgerApi {
  list(input: { projectId: string; source?: string; text?: string; since?: Date; limit: number }): Promise<LedgerEvent[]>;
  get(input: { projectId: string; eventId: number }): Promise<LedgerEvent | null>;
  /** An email event's sender, subject and text, read from the inbox. */
  emailBody(input: { projectId: string; inboxId: string; threadId: string; emailId: string }): Promise<{ from: string | null; subject: string | null; text: string } | null>;
}

const TEAM = eq(humanoidEvents.audience, 'team');

const dbLedger: LedgerApi = {
  async list({ projectId, source, text, since, limit }) {
    const where = [eq(humanoidEvents.projectId, projectId), TEAM];
    if (source) where.push(eq(humanoidEvents.source, source));
    if (since) where.push(gte(humanoidEvents.occurredAt, since));
    if (text) {
      const like = `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      where.push(or(ilike(humanoidEvents.summary, like), ilike(humanoidEvents.subject, like))!);
    }
    return db.select().from(humanoidEvents).where(and(...where)).orderBy(desc(humanoidEvents.eventId)).limit(limit);
  },
  async get({ projectId, eventId }) {
    const [row] = await db.select().from(humanoidEvents).where(and(eq(humanoidEvents.projectId, projectId), eq(humanoidEvents.eventId, eventId), TEAM)).limit(1);
    return row ?? null;
  },
  async emailBody(input) {
    // Lazy: the email channel imports connectors, so a static import here would cycle.
    const { loadReceivedEmail } = await import('../../channels/email/session');
    return loadReceivedEmail(input);
  },
};

let api: LedgerApi = dbLedger;
let sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Tests replace the ledger and make waits instant; never called in production. */
export function setLedgerForTests(next: LedgerApi | null, wait?: ((ms: number) => Promise<void>) | null): void {
  api = next ?? dbLedger;
  sleep = wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

/** An email event's inbox, thread and email ids, from its stored envelope. Pure. */
export function emailRef(e: LedgerEvent): { inboxId: string; threadId: string; emailId: string } | null {
  if (e.source !== 'email') return null;
  const data = ((e.payload.event as { data?: Record<string, unknown> } | undefined)?.data ?? {}) as Record<string, unknown>;
  const inboxId = data.inbox_id, threadId = data.thread_id, emailId = data.email_id;
  return typeof inboxId === 'string' && typeof threadId === 'string' && typeof emailId === 'string' ? { inboxId, threadId, emailId } : null;
}

const view = (e: LedgerEvent) => ({
  id: e.eventId,
  source: e.source,
  type: e.type,
  about: e.subject,
  from: (e.actor?.name as string | undefined) ?? (e.actor?.id as string | undefined) ?? null,
  summary: e.summary,
  at: e.occurredAt.toISOString(),
});

/** The event with an email's text and the codes in it, read from the inbox. */
async function withBody(projectId: string, e: LedgerEvent): Promise<ReturnType<typeof view> & { text?: string; codes: string[] }> {
  const ref = emailRef(e);
  const body = ref ? await api.emailBody({ projectId, ...ref }) : null;
  const text = body ? [body.subject, body.text].filter(Boolean).join('\n') : e.summary;
  return { ...view(e), ...(body ? { text: body.text.slice(0, 8_000) } : {}), codes: codesIn(text) };
}

function sinceArg(args: Record<string, unknown>): Date | undefined {
  const raw = optStr(args, 'since');
  if (!raw) return undefined;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) throw new ToolInputError('since must be an ISO 8601 time, e.g. 2026-11-27T16:00:00Z');
  return at;
}

export const LEDGER_TOOLS: readonly AgentTool[] = [
  {
    name: 'search',
    title: 'Search events',
    description:
      'The workspace\'s event log, newest first: every email, chat message, webhook, schedule and system event it received, with who sent it and what it is about. Filter by source (email, slack, teams, webhook…), text in the summary, and since.',
    inputSchema: schema({ source: s('Only events from this source, e.g. email.'), text: s('Text in the summary or subject.'), since: s('Only events at or after this ISO 8601 time.'), limit: i('At most this many, 1 to 100. Default 20.') }),
    annotations: READ,
    async run(args, ctx) {
      const events = await api.list({ projectId: ctx.state.projectId, source: optStr(args, 'source'), text: optStr(args, 'text'), since: sinceArg(args), limit: Math.min(Math.max(optInt(args, 'limit', 20) ?? 20, 1), 100) });
      return { events: events.map(view) };
    },
  },
  {
    name: 'get',
    title: 'Read an event',
    description: 'One event in full. For an email, its text (read from the inbox) and the verification codes found in it.',
    inputSchema: schema({ id: i('The event id from search.') }, ['id']),
    annotations: READ,
    async run(args, ctx) {
      const id = optInt(args, 'id');
      if (!id) throw new ToolInputError('give the event id');
      const e = await api.get({ projectId: ctx.state.projectId, eventId: id });
      if (!e) throw new ToolInputError(`no event ${id}`);
      return withBody(ctx.state.projectId, e);
    },
  },
  {
    name: 'wait_for',
    title: 'Wait for an event',
    description:
      'Waits for a new event that matches, and returns it with its text and the codes in it: the verification email a sign-up sends, a reply. Note the time before you trigger it and pass it as since. Gives up after timeout_seconds (default 60, at most 120).',
    inputSchema: schema({
      source: s('Only this source, e.g. email.'),
      text: s('Text in the summary, e.g. the site\'s name or the sender.'),
      since: s('The ISO 8601 time just before you triggered it. Default: now.'),
      timeout_seconds: i('5 to 120 seconds, default 60.'),
    }),
    annotations: READ,
    async run(args, ctx) {
      const since = sinceArg(args) ?? new Date(ctx.now());
      const deadline = ctx.now() + Math.min(Math.max(optInt(args, 'timeout_seconds', 60) ?? 60, 5), 120) * 1000;
      const source = optStr(args, 'source');
      const text = optStr(args, 'text');
      for (;;) {
        const [hit] = await api.list({ projectId: ctx.state.projectId, source, text, since, limit: 1 });
        if (hit) {
          const full = await withBody(ctx.state.projectId, hit);
          return { received: true, event: full, code: full.codes[0] ?? null };
        }
        if (ctx.now() >= deadline) return { received: false, waited_until: new Date(deadline).toISOString() };
        await sleep(2_000);
      }
    },
  },
];
