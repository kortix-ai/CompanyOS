/**
 * `kortix_phone`: a phone number of an agent's own, for the codes sites send
 * by text message when it signs up or signs in, and for texts it sends.
 *
 * One number per account, bought on the first `get_number` from the server's
 * phone provider (Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`). Incoming
 * texts are read from the provider's message log by the number, so no webhook
 * and no Kortix route is involved.
 *
 * Limits a caller should know: some sites refuse virtual (VoIP) numbers for
 * verification codes, and a US number sends texts to US phones only after
 * A2P 10DLC registration. Receiving works without it.
 */
import { config } from '../../config';
import { type AgentTool, DESTRUCTIVE, i, optInt, optStr, READ, reqStr, s, schema, ToolInputError, WRITE } from './tool';

export interface PhoneData {
  number?: string;
  /** The provider's id of the number. */
  numberId?: string;
  country?: string;
  boughtAt?: string;
}

export interface PhoneMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  direction: 'inbound' | 'outbound';
  sentAt: string;
}

/** The phone provider the tools use. Tests replace it. */
export interface PhoneApi {
  /** The number already bought under `tag`, if one is. */
  findNumber(tag: string): Promise<{ id: string; number: string } | null>;
  buyNumber(input: { country: string; areaCode?: string; tag: string }): Promise<{ id: string; number: string }>;
  releaseNumber(id: string): Promise<void>;
  send(input: { from: string; to: string; body: string }): Promise<{ id: string; status: string }>;
  /** Newest first. */
  listInbound(input: { to: string; since?: Date; limit: number }): Promise<PhoneMessage[]>;
}

const TWILIO = 'https://api.twilio.com/2010-04-01';

async function twilio<T>(path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<T> {
  const sid = config.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`${TWILIO}/Accounts/${encodeURIComponent(sid)}${path}`, {
    method: init.method ?? (init.form ? 'POST' : 'GET'),
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${config.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // not JSON: the raw text
    }
    // The provider refused the request (no number in that area, a blocked destination): the agent can act on it.
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403) throw new ToolInputError(`the phone provider refused: ${message}`);
    throw new Error(`phone provider ${res.status}: ${message}`);
  }
  return JSON.parse(text) as T;
}

interface TwilioMessage { sid: string; from: string; to: string; body: string; direction: string; date_sent: string | null; date_created: string }

const twilioPhones: PhoneApi = {
  async findNumber(tag) {
    const r = await twilio<{ incoming_phone_numbers: Array<{ sid: string; phone_number: string }> }>(`/IncomingPhoneNumbers.json?FriendlyName=${encodeURIComponent(tag)}&PageSize=1`);
    const hit = r.incoming_phone_numbers[0];
    return hit ? { id: hit.sid, number: hit.phone_number } : null;
  },
  async buyNumber({ country, areaCode, tag }) {
    const query = new URLSearchParams({ SmsEnabled: 'true', PageSize: '1', ...(areaCode ? { AreaCode: areaCode } : {}) });
    const found = await twilio<{ available_phone_numbers: Array<{ phone_number: string }> }>(`/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json?${query}`);
    const candidate = found.available_phone_numbers[0]?.phone_number;
    if (!candidate) throw new ToolInputError(`no number that receives texts is available in ${country}${areaCode ? ` area ${areaCode}` : ''}; try another area code or country`);
    const bought = await twilio<{ sid: string; phone_number: string }>('/IncomingPhoneNumbers.json', { form: { PhoneNumber: candidate, FriendlyName: tag } });
    return { id: bought.sid, number: bought.phone_number };
  },
  async releaseNumber(id) {
    await twilio(`/IncomingPhoneNumbers/${encodeURIComponent(id)}.json`, { method: 'DELETE' });
  },
  async send({ from, to, body }) {
    const sent = await twilio<{ sid: string; status: string }>('/Messages.json', { form: { From: from, To: to, Body: body } });
    return { id: sent.sid, status: sent.status };
  },
  async listInbound({ to, since, limit }) {
    const query = new URLSearchParams({ To: to, PageSize: String(limit) });
    // Twilio filters by day; the exact cut is made below.
    if (since) query.set('DateSent>', since.toISOString().slice(0, 10));
    const r = await twilio<{ messages: TwilioMessage[] }>(`/Messages.json?${query}`);
    return r.messages
      .filter((m) => m.direction === 'inbound')
      .map((m) => ({ id: m.sid, from: m.from, to: m.to, body: m.body, direction: 'inbound' as const, sentAt: new Date(m.date_sent ?? m.date_created).toISOString() }))
      .filter((m) => !since || new Date(m.sentAt) >= since);
  },
};

const unconfigured = (): never => {
  throw new ToolInputError('this Kortix server has no phone provider; an operator sets TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
};
// A kortix.yaml can name the phone server where no provider is set: every call refuses plainly.
const providerOrRefusal: PhoneApi = {
  findNumber: (tag) => (phoneProviderConfigured() ? twilioPhones.findNumber(tag) : unconfigured()),
  buyNumber: (input) => (phoneProviderConfigured() ? twilioPhones.buyNumber(input) : unconfigured()),
  releaseNumber: (id) => (phoneProviderConfigured() ? twilioPhones.releaseNumber(id) : unconfigured()),
  send: (input) => (phoneProviderConfigured() ? twilioPhones.send(input) : unconfigured()),
  listInbound: (input) => (phoneProviderConfigured() ? twilioPhones.listInbound(input) : unconfigured()),
};

let api: PhoneApi = providerOrRefusal;
/** Tests replace the provider; never called in production. */
export function setPhoneApiForTests(next: PhoneApi | null): void {
  api = next ?? providerOrRefusal;
}

let sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Tests make waits instant; never called in production. */
export function setPhoneSleepForTests(fn: ((ms: number) => Promise<void>) | null): void {
  sleep = fn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

/** True when this server can give out numbers. */
export function phoneProviderConfigured(): boolean {
  return Boolean(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN);
}

const E164 = /^\+[1-9]\d{6,14}$/;

/** The verification codes in a text: 4 to 8 digits, also written "123-456" or "123 456". Pure. */
export function codesIn(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/(?<![\d])(\d{3})[- ](\d{3})(?![\d])|(?<![\d])(\d{4,8})(?![\d])/g)) {
    found.add(m[3] ?? `${m[1]}${m[2]}`);
  }
  return [...found];
}

const view = (m: PhoneMessage) => ({ id: m.id, from: m.from, body: m.body, codes: codesIn(m.body), sent_at: m.sentAt });

type Ctx = Parameters<AgentTool<PhoneData>['run']>[1];

function requireNumber(ctx: Ctx): string {
  const number = ctx.state.data.number;
  if (!number) throw new ToolInputError('this account has no number yet; get_number gets one');
  return number;
}

function sinceArg(args: Record<string, unknown>): Date | undefined {
  const raw = optStr(args, 'since');
  if (!raw) return undefined;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) throw new ToolInputError('since must be an ISO 8601 time, e.g. 2026-11-27T16:00:00Z');
  return at;
}

export const PHONE_TOOLS: readonly AgentTool<PhoneData>[] = [
  {
    name: 'get_number',
    title: 'Get its phone number',
    description:
      'The account\'s phone number, in E.164 form (+14155550123). The first call buys one, which costs money: pick the country (ISO code, default US) and optionally an area code. Later calls return the same number.',
    inputSchema: schema({ country: s('ISO 3166 country code, e.g. US, GB, DE. Default US.'), area_code: s('An area code, e.g. 415 (US/CA only).') }),
    annotations: WRITE,
    async run(args, ctx) {
      const data = ctx.state.data;
      if (data.number) return { number: data.number, country: data.country ?? null, new: false };
      const tag = `kortix-${ctx.state.connectionId}`;
      // A number an earlier call bought before its state write failed is found by its tag, not bought twice.
      const owned = await api.findNumber(tag);
      const country = (optStr(args, 'country') ?? 'US').toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw new ToolInputError('country must be a two-letter ISO code, e.g. US');
      const bought = owned ?? (await api.buyNumber({ country, areaCode: optStr(args, 'area_code'), tag }));
      await ctx.save({ ...data, number: bought.number, numberId: bought.id, country, boughtAt: new Date(ctx.now()).toISOString() });
      return { number: bought.number, country, new: !owned };
    },
  },
  {
    name: 'list_messages',
    title: 'Read its texts',
    description: 'Texts the number received, newest first, each with the verification codes found in it (`codes`).',
    inputSchema: schema({ since: s('Only texts at or after this ISO 8601 time.'), limit: i('At most this many, 1 to 50, default 20.') }),
    annotations: READ,
    async run(args, ctx) {
      const messages = await api.listInbound({ to: requireNumber(ctx), since: sinceArg(args), limit: Math.min(Math.max(optInt(args, 'limit', 20) ?? 20, 1), 50) });
      return { number: ctx.state.data.number, messages: messages.map(view) };
    },
  },
  {
    name: 'wait_for_code',
    title: 'Wait for a text code',
    description:
      'Waits for a new text to the number and returns it with its codes. Note the time before you ask a site to send the code and pass it as `since`. Optionally only texts whose sender or body contains `from`. Gives up after `timeout_seconds` (default 60, at most 120).',
    inputSchema: schema({
      since: s('The ISO 8601 time just before the code was requested. Default: now.'),
      from: s('Only texts whose sender or body contains this, e.g. the site\'s name.'),
      timeout_seconds: i('How long to wait: 5 to 120 seconds, default 60.'),
    }),
    annotations: READ,
    async run(args, ctx) {
      const to = requireNumber(ctx);
      const since = sinceArg(args) ?? new Date(ctx.now());
      const from = optStr(args, 'from')?.toLowerCase();
      const deadline = ctx.now() + Math.min(Math.max(optInt(args, 'timeout_seconds', 60) ?? 60, 5), 120) * 1000;
      for (;;) {
        const messages = await api.listInbound({ to, since, limit: 20 });
        const hit = messages.find((m) => !from || m.from.toLowerCase().includes(from) || m.body.toLowerCase().includes(from));
        if (hit) return { received: true, message: view(hit), code: codesIn(hit.body)[0] ?? null };
        if (ctx.now() >= deadline) return { received: false, waited_until: new Date(deadline).toISOString() };
        await sleep(3_000);
      }
    },
  },
  {
    name: 'send_sms',
    title: 'Send a text',
    description: 'Send a text message from the account\'s number. `to` in E.164 form (+14155550123).',
    inputSchema: schema({ to: s('The recipient, e.g. +14155550123.'), body: s('The message, at most 1600 characters.') }, ['to', 'body']),
    annotations: WRITE,
    async run(args, ctx) {
      const from = requireNumber(ctx);
      const to = reqStr(args, 'to').replace(/[\s()-]/g, '');
      if (!E164.test(to)) throw new ToolInputError('to must be an E.164 number, e.g. +14155550123');
      const body = reqStr(args, 'body');
      if (body.length > 1600) throw new ToolInputError('body is over 1600 characters');
      const sent = await api.send({ from, to, body });
      return { sent: true, id: sent.id, status: sent.status, from, to };
    },
  },
  {
    name: 'release_number',
    title: 'Give up its number',
    description: 'Release the number for good. Every site that sends codes to it loses that way to reach the agent, and it cannot be bought back.',
    inputSchema: schema({ confirm: s('The number itself, to confirm.') }, ['confirm']),
    annotations: DESTRUCTIVE,
    async run(args, ctx) {
      const { number, numberId, ...rest } = ctx.state.data;
      if (!number || !numberId) throw new ToolInputError('this account has no number');
      if (reqStr(args, 'confirm').replace(/[\s()-]/g, '') !== number) throw new ToolInputError(`pass confirm: "${number}"`);
      await api.releaseNumber(numberId);
      const { boughtAt: _boughtAt, country: _country, ...kept } = rest;
      await ctx.save(kept);
      return { released: number };
    },
  },
];
