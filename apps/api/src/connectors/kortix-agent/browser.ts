/**
 * `kortix_browser`: an agent's own browser, a Platinum Browser (a Chromium on
 * Platinum whose profile stays on its disk). One per account: every session
 * that uses the account drives the same browser, so one login serves them all.
 * Logins survive pauses on the browser's disk, and `save_login` copies the
 * cookies and local storage to a Platinum saved profile, from which a new
 * browser starts signed in if the old one is gone.
 *
 * The CDP URL gives full control of the browser: `connect` mints a
 * short-lived one for agent-browser (`agent-browser --cdp <url>`) and no other
 * tool returns it.
 */
import { PlatinumHttpError, platinumJson } from '../../shared/platinum';
import { type AgentTool, DESTRUCTIVE, i, optInt, READ, s, schema, ToolInputError, WRITE } from './tool';

export interface BrowserData {
  /** The Platinum browser this account drives. */
  browserId?: string;
  /** The Platinum saved profile its logins are backed up to. */
  profileId?: string;
  createdAt?: string;
}

export interface PlatinumBrowser {
  id: string;
  status: string;
  region?: string | null;
  cdp_url?: string;
  cdp_url_expires_at?: string;
  last_error?: string | null;
}

/** The Platinum Browsers API the tools use. Tests replace it. */
export interface BrowserApi {
  create(input: { name: string; idleTimeoutMinutes: number; profileId?: string; idempotencyKey: string }): Promise<PlatinumBrowser>;
  get(id: string): Promise<PlatinumBrowser | null>;
  resume(id: string): Promise<PlatinumBrowser>;
  pause(id: string): Promise<void>;
  cdpUrl(id: string, ttlSeconds: number): Promise<{ cdp_url: string; expires_at: string }>;
  createProfile(name: string): Promise<{ id: string }>;
  saveProfile(id: string, profileId: string): Promise<{ cookie_count: number; origins: string[] }>;
  remove(id: string): Promise<void>;
}

const json = (body: unknown, extra: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

const platinumBrowsers: BrowserApi = {
  create: (input) => platinumJson<PlatinumBrowser>('/v1/browsers', json(
    { name: input.name, idle_timeout_minutes: input.idleTimeoutMinutes, ...(input.profileId ? { profile_id: input.profileId } : {}) },
    { 'Idempotency-Key': input.idempotencyKey },
  )),
  get: async (id) => {
    try {
      return await platinumJson<PlatinumBrowser>(`/v1/browsers/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof PlatinumHttpError && error.status === 404) return null;
      throw error;
    }
  },
  resume: (id) => platinumJson<PlatinumBrowser>(`/v1/browsers/${encodeURIComponent(id)}/resume`, { method: 'POST' }),
  pause: async (id) => {
    await platinumJson(`/v1/browsers/${encodeURIComponent(id)}/pause`, { method: 'POST' });
  },
  cdpUrl: (id, ttlSeconds) => platinumJson(`/v1/browsers/${encodeURIComponent(id)}/cdp-url`, json({ ttl_seconds: ttlSeconds })),
  createProfile: (name) => platinumJson('/v1/browsers/profiles', json({ name })),
  saveProfile: (id, profileId) => platinumJson(`/v1/browsers/${encodeURIComponent(id)}/save-profile`, json({ profile_id: profileId })),
  remove: async (id) => {
    await platinumJson(`/v1/browsers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

let api: BrowserApi = platinumBrowsers;
/** Tests replace Platinum; never called in production. */
export function setBrowserApiForTests(next: BrowserApi | null): void {
  api = next ?? platinumBrowsers;
}

/** Pause after this many idle minutes; the next connect wakes it. */
export const BROWSER_IDLE_MINUTES = 30;
const GONE = new Set(['deleted', 'failed']);

type Ctx = Parameters<AgentTool<BrowserData>['run']>[1];

/** The account's browser, created (from its saved profile when there is one) or resumed as needed. */
async function ensureBrowser(ctx: Ctx): Promise<PlatinumBrowser> {
  const data = ctx.state.data;
  if (data.browserId) {
    const current = await api.get(data.browserId);
    if (current && !GONE.has(current.status)) {
      // A new connection also wakes it; resuming first makes it ready sooner.
      if (current.status === 'paused') return api.resume(current.id);
      return current;
    }
  }
  const created = await api.create({
    name: `kortix-${ctx.state.connectionId.slice(0, 8)}`,
    idleTimeoutMinutes: BROWSER_IDLE_MINUTES,
    ...(data.profileId ? { profileId: data.profileId } : {}),
    // A retry of the same create returns the same browser; a replacement after a loss gets a new one.
    idempotencyKey: `kortix-browser-${ctx.state.connectionId}-${data.browserId ?? 'first'}`,
  });
  await ctx.save({ ...data, browserId: created.id, createdAt: new Date(ctx.now()).toISOString() });
  return created;
}

const view = (b: PlatinumBrowser) => ({ status: b.status, region: b.region ?? null, ...(b.last_error ? { last_error: b.last_error } : {}) });

export const BROWSER_TOOLS: readonly AgentTool<BrowserData>[] = [
  {
    name: 'connect',
    title: 'Connect to its browser',
    description:
      'Starts or wakes this account\'s browser and returns a short-lived CDP URL. Drive it with agent-browser: `agent-browser --cdp "<cdp_url>" open https://…`. Every session on this account shares the same browser and its logins. The URL is a credential: never print it in a message or a file.',
    inputSchema: schema({ ttl_seconds: i('How long the URL opens new connections: 60 to 3600, default 900.') }),
    annotations: WRITE,
    async run(args, ctx) {
      const ttl = Math.min(Math.max(optInt(args, 'ttl_seconds', 900) ?? 900, 60), 3600);
      const browser = await ensureBrowser(ctx);
      let url: Awaited<ReturnType<BrowserApi['cdpUrl']>>;
      try {
        url = await api.cdpUrl(browser.id, ttl);
      } catch (error) {
        // Platinum restarts a browser that stopped answering within about a minute.
        if (error instanceof PlatinumHttpError && error.status === 503) {
          throw new ToolInputError('the browser is restarting; call connect again in about a minute');
        }
        throw error;
      }
      return { ...view(browser), cdp_url: url.cdp_url, expires_at: url.expires_at, use: 'agent-browser --cdp "<cdp_url>" <command>' };
    },
  },
  {
    name: 'status',
    title: 'Browser status',
    description: 'Whether this account has a browser and its state (running, paused, starting), and whether its logins are backed up.',
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      const { browserId, profileId } = ctx.state.data;
      const browser = browserId ? await api.get(browserId) : null;
      return { has_browser: Boolean(browser && !GONE.has(browser.status)), ...(browser ? view(browser) : { status: 'none' }), logins_backed_up: Boolean(profileId) };
    },
  },
  {
    name: 'save_login',
    title: 'Back up its logins',
    description: 'Copies the browser\'s cookies and local storage to its saved profile, so a new browser starts signed in. Call it after signing in to a site.',
    inputSchema: schema({}),
    annotations: WRITE,
    async run(_args, ctx) {
      const browser = await ensureBrowser(ctx);
      let profileId = ctx.state.data.profileId;
      if (!profileId) {
        profileId = (await api.createProfile(`kortix-${ctx.state.connectionId}`)).id;
        await ctx.save({ ...ctx.state.data, profileId });
      }
      const saved = await api.saveProfile(browser.id, profileId);
      return { saved: true, cookie_count: saved.cookie_count, sites: saved.origins };
    },
  },
  {
    name: 'pause',
    title: 'Pause its browser',
    description: 'Pause the browser to stop paying for it. Its disk and logins stay; open tabs close. connect wakes it.',
    inputSchema: schema({}),
    annotations: WRITE,
    async run(_args, ctx) {
      const { browserId } = ctx.state.data;
      if (!browserId) throw new ToolInputError('this account has no browser yet; connect starts one');
      await api.pause(browserId);
      return { paused: true };
    },
  },
  {
    name: 'reset',
    title: 'Reset its browser',
    description: 'Delete the browser and its disk. The next connect starts a new one from the saved logins (save_login), or signed out when there are none.',
    inputSchema: schema({ confirm: s('Type "reset" to confirm.') }, ['confirm']),
    annotations: DESTRUCTIVE,
    async run(args, ctx) {
      if (args.confirm !== 'reset') throw new ToolInputError('pass confirm: "reset"');
      const { browserId, createdAt: _createdAt, ...rest } = ctx.state.data;
      if (browserId) await api.remove(browserId);
      await ctx.save(rest);
      return { reset: true, logins_backed_up: Boolean(rest.profileId) };
    },
  },
];
