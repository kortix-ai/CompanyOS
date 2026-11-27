/**
 * `kortix_browser`: an agent's browser identity on Platinum Browsers. One
 * account is one identity: its logins (a Platinum saved profile, cookies and
 * localStorage) and its stored site logins. Every session gets its own copy,
 * a browser started from those logins, so many copies run at once and each
 * starts signed in. The agent drives its copy itself over CDP
 * (`agent-browser --cdp <url>`).
 *
 * A login made in one copy reaches the others through `save_login`: the
 * copy's cookies and localStorage for that site merge into the identity's
 * profile, cookie by cookie, so two copies saving different sites never
 * overwrite each other. The next copy starts with both.
 *
 * Stored passwords never pass through the model: `fill_login` types them
 * into the copy's page from here (./browser-page.ts).
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PlatinumHttpError, platinumJson } from '../../shared/platinum';
import { CdpConnection } from './cdp';
import { attachPage, fillLogin, listTabs, pageInfo } from './browser-page';
import { type AgentTool, DESTRUCTIVE, i, optInt, optStr, READ, reqStr, s, schema, ToolInputError, WRITE } from './tool';

/** At most this many copies of one identity run at once. */
export const COPIES_MAX = 10;
export const SITES_MAX = 500;

export interface SiteRecord {
  origin: string;
  username?: string;
  /** Never returned by a tool; `fill_login` types it into the page. */
  password?: string;
  notes?: string;
  /** When `save_login` last merged this site's cookies into the identity. */
  savedAt?: string;
  updatedAt: string;
}

export interface CopyRecord {
  browserId: string;
  /** The session the copy serves; '' for calls outside a session. */
  session: string;
  createdAt: string;
}

export interface BrowserData {
  /** The identity's logins: a Platinum saved profile every copy starts from. */
  profileId?: string;
  /** Where a copy's state is captured before it merges into `profileId`. */
  scratchProfileId?: string;
  copies?: Record<string, CopyRecord>;
  sites?: Record<string, SiteRecord>;
}

export interface PlatinumBrowser {
  id: string;
  status: string;
  region?: string | null;
  last_error?: string | null;
}

/** Playwright storage state, the format of a Platinum saved profile. */
export interface StorageState {
  cookies: Array<{ name: string; value: string; domain: string; path: string; expires?: number; [key: string]: unknown }>;
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

/** The Platinum Browsers API the tools use. Tests replace it. */
export interface BrowserApi {
  create(input: { name: string; idleTimeoutMinutes: number; profileId?: string; idempotencyKey: string }): Promise<PlatinumBrowser>;
  get(id: string): Promise<PlatinumBrowser | null>;
  resume(id: string): Promise<PlatinumBrowser>;
  cdpUrl(id: string, ttlSeconds: number): Promise<{ cdp_url: string; expires_at: string }>;
  remove(id: string): Promise<void>;
  createProfile(name: string): Promise<{ id: string }>;
  deleteProfile(id: string): Promise<void>;
  saveProfile(browserId: string, profileId: string): Promise<{ cookie_count: number; origins: string[] }>;
  getState(profileId: string): Promise<StorageState>;
  putState(profileId: string, state: StorageState): Promise<void>;
}

const json = (body: unknown, method = 'POST', extra: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...extra },
  body: JSON.stringify(body),
});

const enc = encodeURIComponent;

const platinumBrowsers: BrowserApi = {
  create: (input) =>
    platinumJson<PlatinumBrowser>(
      '/v1/browsers',
      json({ name: input.name, idle_timeout_minutes: input.idleTimeoutMinutes, ...(input.profileId ? { profile_id: input.profileId } : {}) }, 'POST', { 'Idempotency-Key': input.idempotencyKey }),
    ),
  get: async (id) => {
    try {
      return await platinumJson<PlatinumBrowser>(`/v1/browsers/${enc(id)}`);
    } catch (error) {
      if (error instanceof PlatinumHttpError && error.status === 404) return null;
      throw error;
    }
  },
  resume: (id) => platinumJson<PlatinumBrowser>(`/v1/browsers/${enc(id)}/resume`, { method: 'POST' }),
  cdpUrl: (id, ttlSeconds) => platinumJson(`/v1/browsers/${enc(id)}/cdp-url`, json({ ttl_seconds: ttlSeconds })),
  remove: async (id) => {
    try {
      await platinumJson(`/v1/browsers/${enc(id)}`, { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof PlatinumHttpError && error.status === 404)) throw error;
    }
  },
  createProfile: (name) => platinumJson('/v1/browsers/profiles', json({ name })),
  deleteProfile: async (id) => {
    try {
      await platinumJson(`/v1/browsers/profiles/${enc(id)}`, { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof PlatinumHttpError && error.status === 404)) throw error;
    }
  },
  saveProfile: (browserId, profileId) => platinumJson(`/v1/browsers/${enc(browserId)}/save-profile`, json({ profile_id: profileId })),
  getState: (profileId) => platinumJson<StorageState>(`/v1/browsers/profiles/${enc(profileId)}/state`),
  putState: async (profileId, state) => {
    await platinumJson(`/v1/browsers/profiles/${enc(profileId)}/state`, json(state, 'PUT'));
  },
};

/** Opens a CDP connection. Tests replace it with a fake browser. */
export type CdpOpener = (url: string) => Promise<CdpConnection>;

let api: BrowserApi = platinumBrowsers;
let openCdp: CdpOpener = (url) => CdpConnection.open(url);
/** Tests replace Platinum and the CDP socket; never called in production. */
export function setBrowserApiForTests(next: BrowserApi | null, opener?: CdpOpener | null): void {
  api = next ?? platinumBrowsers;
  openCdp = opener ?? ((url) => CdpConnection.open(url));
}

/** A copy pauses after this many idle minutes; the next connect wakes it. */
export const BROWSER_IDLE_MINUTES = 30;
const GONE = new Set(['deleted', 'failed']);

type Ctx = Parameters<AgentTool<BrowserData>['run']>[1];

/** `https://Accounts.Example.com/login?x` → `https://accounts.example.com`. Pure. */
export function siteOrigin(value: string): string {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('not a web address');
    return url.origin.toLowerCase();
  } catch {
    throw new ToolInputError(`${value} is not a site address, e.g. https://github.com`);
  }
}

/** A cookie for `domain` is sent to `host`, or set by a page on it: the same host, a parent, or a subdomain. Pure. */
function cookieOnSite(domain: string, host: string): boolean {
  const d = domain.replace(/^\./, '').toLowerCase();
  return d === host || host.endsWith(`.${d}`) || d.endsWith(`.${host}`);
}

/**
 * The identity's state with one site's logins taken from a copy: the copy's
 * cookies for that site replace the identity's cookies for it, and its
 * localStorage for that origin replaces the identity's. Every other site is
 * kept as it was. With `origin` null, the copy's whole state wins over the
 * identity's, key by key, and nothing of the identity is dropped. Pure.
 */
export function mergeSiteState(identity: StorageState, copy: StorageState, origin: string | null): StorageState {
  const key = (c: StorageState['cookies'][number]) => `${c.name}\u0000${c.domain.replace(/^\./, '')}\u0000${c.path}`;
  if (origin === null) {
    const cookies = new Map(identity.cookies.map((c) => [key(c), c]));
    for (const c of copy.cookies) cookies.set(key(c), c);
    const origins = new Map(identity.origins.map((o) => [o.origin, o]));
    for (const o of copy.origins) origins.set(o.origin, o);
    return { cookies: [...cookies.values()], origins: [...origins.values()] };
  }
  const host = new URL(origin).hostname;
  return {
    cookies: [...identity.cookies.filter((c) => !cookieOnSite(c.domain, host)), ...copy.cookies.filter((c) => cookieOnSite(c.domain, host))],
    origins: [...identity.origins.filter((o) => o.origin !== origin), ...copy.origins.filter((o) => o.origin === origin)],
  };
}

/** A strong password most sites accept: 20 characters with upper, lower, digit and symbol. */
export function generatePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#%^*-_=+'];
  const all = sets.join('');
  const bytes = randomBytes(40);
  const chars = sets.map((set, n) => set[bytes[n]! % set.length]!);
  for (let n = chars.length; n < 20; n++) chars.push(all[bytes[n]! % all.length]!);
  for (let n = chars.length - 1; n > 0; n--) {
    const j = bytes[20 + (n % 20)]! % (n + 1);
    [chars[n], chars[j]] = [chars[j]!, chars[n]!];
  }
  return chars.join('');
}

const sessionKey = (ctx: Ctx) => ctx.sessionId ?? '';

/** The calling session's copy, if one is alive. Copies Platinum lost are dropped from the state. */
async function liveCopy(ctx: Ctx): Promise<{ copy: CopyRecord; browser: PlatinumBrowser } | null> {
  const copy = ctx.state.data.copies?.[sessionKey(ctx)];
  if (!copy) return null;
  const browser = await api.get(copy.browserId);
  if (browser && !GONE.has(browser.status)) return { copy, browser };
  await ctx.update((d) => {
    const { [sessionKey(ctx)]: _gone, ...copies } = d.copies ?? {};
    return { ...d, copies };
  });
  return null;
}

/** The calling session's copy, started from the identity's logins when it has none. */
async function ensureCopy(ctx: Ctx, fresh: boolean): Promise<{ copy: CopyRecord; browser: PlatinumBrowser; created: boolean }> {
  const current = await liveCopy(ctx);
  if (current && !fresh) {
    const browser = current.browser.status === 'paused' ? await api.resume(current.browser.id) : current.browser;
    return { copy: current.copy, browser, created: false };
  }
  if (current) await api.remove(current.copy.browserId);
  const others = Object.values(ctx.state.data.copies ?? {}).filter((c) => c.session !== sessionKey(ctx));
  if (others.length >= COPIES_MAX) throw new ToolInputError(`${COPIES_MAX} copies of this browser are open; release one (copies lists them)`);
  const session = sessionKey(ctx);
  const browser = await api.create({
    name: `kortix-${ctx.state.connectionId.slice(0, 8)}-${(session || 'workspace').slice(0, 8)}`,
    idleTimeoutMinutes: BROWSER_IDLE_MINUTES,
    ...(ctx.state.data.profileId ? { profileId: ctx.state.data.profileId } : {}),
    // Fresh per create: a retried request returns the same copy, and a copy
    // after a release is a new one, never the deleted browser.
    idempotencyKey: `kortix-browser-${randomUUID()}`,
  });
  const copy: CopyRecord = { browserId: browser.id, session, createdAt: new Date(ctx.now()).toISOString() };
  await ctx.update((d) => ({ ...d, copies: { ...(d.copies ?? {}), [session]: copy } }));
  return { copy, browser, created: true };
}

async function mintCdpUrl(browserId: string, ttl: number): Promise<{ cdp_url: string; expires_at: string }> {
  try {
    return await api.cdpUrl(browserId, ttl);
  } catch (error) {
    // Platinum restarts a browser that stopped answering within about a minute.
    if (error instanceof PlatinumHttpError && error.status === 503) throw new ToolInputError('the browser is restarting; try again in about a minute');
    throw error;
  }
}

/** Run `fn` on the session copy's tab for `origin` (or its first tab), over a short-lived CDP connection. */
async function onCopyPage<T>(ctx: Ctx, origin: string | null, fn: (page: Awaited<ReturnType<typeof attachPage>>) => Promise<T>): Promise<T> {
  const current = await liveCopy(ctx);
  if (!current) throw new ToolInputError('this session has no browser copy; connect first');
  const conn = await openCdp((await mintCdpUrl(current.copy.browserId, 120)).cdp_url);
  try {
    const tabs = await listTabs(conn);
    const tab = origin ? tabs.find((t) => t.url.toLowerCase().startsWith(origin)) : undefined;
    return await fn(await attachPage(conn, tab?.id ?? null));
  } finally {
    conn.close();
  }
}

/** The identity's saved profile and the scratch profile, created on first need. */
async function ensureProfiles(ctx: Ctx): Promise<{ profileId: string; scratchProfileId: string }> {
  let { profileId, scratchProfileId } = ctx.state.data;
  if (!profileId) profileId = (await api.createProfile(`kortix-${ctx.state.connectionId}`)).id;
  if (!scratchProfileId) scratchProfileId = (await api.createProfile(`kortix-${ctx.state.connectionId}-scratch`)).id;
  const created = { profileId, scratchProfileId };
  const data = await ctx.update((d) => ({ ...d, profileId: d.profileId ?? created.profileId, scratchProfileId: d.scratchProfileId ?? created.scratchProfileId }));
  return { profileId: data.profileId!, scratchProfileId: data.scratchProfileId! };
}

const siteView = (site: SiteRecord) => ({
  site: site.origin,
  username: site.username ?? null,
  has_password: Boolean(site.password),
  notes: site.notes ?? null,
  saved_at: site.savedAt ?? null,
  updated_at: site.updatedAt,
});

export const BROWSER_TOOLS: readonly AgentTool<BrowserData>[] = [
  {
    name: 'connect',
    title: 'Get your browser',
    description:
      'This session\'s copy of the browser, started (signed in with every saved login) or woken as needed, and a short-lived CDP URL to drive it: `agent-browser --cdp "<cdp_url>" open https://…`. Each session has its own copy, so sessions never fight over tabs. After signing in somewhere, call save_login so every other copy has that login too. The URL is a credential: never print it in a message or a file.',
    inputSchema: schema({
      new_copy: { type: 'boolean', description: 'Replace this session\'s copy with a fresh one from the saved logins.' },
      ttl_seconds: i('How long the URL opens new connections: 60 to 3600, default 900.'),
    }),
    annotations: WRITE,
    async run(args, ctx) {
      const ttl = Math.min(Math.max(optInt(args, 'ttl_seconds', 900) ?? 900, 60), 3600);
      const { browser, created } = await ensureCopy(ctx, args.new_copy === true);
      const url = await mintCdpUrl(browser.id, ttl);
      const signedIn = Object.values(ctx.state.data.sites ?? {}).filter((site) => site.savedAt).map((site) => site.origin);
      return { copy: browser.id, new: created, status: browser.status, cdp_url: url.cdp_url, expires_at: url.expires_at, saved_logins: signedIn, use: 'agent-browser --cdp "<cdp_url>" <command>' };
    },
  },
  {
    name: 'copies',
    title: 'Open copies',
    description: 'The copies of this browser that are open, which session each serves, and their state (running, paused).',
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      const copies = await Promise.all(
        Object.values(ctx.state.data.copies ?? {}).map(async (copy) => {
          const browser = await api.get(copy.browserId);
          return { copy: copy.browserId, session: copy.session || null, yours: copy.session === sessionKey(ctx), status: browser?.status ?? 'deleted', created_at: copy.createdAt };
        }),
      );
      const gone = copies.filter((c) => GONE.has(c.status)).map((c) => c.copy);
      if (gone.length) {
        await ctx.update((d) => ({ ...d, copies: Object.fromEntries(Object.entries(d.copies ?? {}).filter(([, c]) => !gone.includes(c.browserId))) }));
      }
      return { copies: copies.filter((c) => !GONE.has(c.status)), max: COPIES_MAX };
    },
  },
  {
    name: 'release',
    title: 'Close a copy',
    description: 'Close this session\'s copy (or the copy `copy` names) for good, to stop paying for it. Save its logins first; the identity keeps every saved login.',
    inputSchema: schema({ copy: s('The copy id from copies. Default: this session\'s.') }),
    annotations: WRITE,
    async run(args, ctx) {
      const id = optStr(args, 'copy') ?? ctx.state.data.copies?.[sessionKey(ctx)]?.browserId;
      const entry = Object.entries(ctx.state.data.copies ?? {}).find(([, c]) => c.browserId === id);
      if (!id || !entry) throw new ToolInputError('no such copy; copies lists them');
      await api.remove(id);
      await ctx.update((d) => {
        const { [entry[0]]: _gone, ...copies } = d.copies ?? {};
        return { ...d, copies };
      });
      return { released: id };
    },
  },
  {
    name: 'save_login',
    title: 'Save a login',
    description:
      'After signing in to a site in your copy: merge that site\'s cookies and storage into the browser\'s saved logins, so every copy opened from now on is signed in there. Other sites\' logins are untouched. all: true saves every site of your copy.',
    inputSchema: schema({ site: s('The site you signed in to, e.g. https://github.com. Default: your copy\'s current page.'), all: { type: 'boolean', description: 'Save every site of your copy, not one.' } }),
    annotations: WRITE,
    async run(args, ctx) {
      const current = await liveCopy(ctx);
      if (!current) throw new ToolInputError('this session has no browser copy; connect first');
      const all = args.all === true;
      const site = optStr(args, 'site');
      const origin = all ? null : siteOrigin(site ?? (await onCopyPage(ctx, null, async (page) => (await pageInfo(page)).url)));
      const { profileId, scratchProfileId } = await ensureProfiles(ctx);
      await api.saveProfile(current.copy.browserId, scratchProfileId);
      const [identity, copy] = await Promise.all([api.getState(profileId), api.getState(scratchProfileId)]);
      const merged = mergeSiteState(identity, copy, origin);
      await api.putState(profileId, merged);
      const now = new Date(ctx.now()).toISOString();
      const saved = origin ? [origin] : copy.origins.map((o) => o.origin.toLowerCase());
      await ctx.update((d) => {
        const sites = { ...(d.sites ?? {}) };
        for (const o of saved) sites[o] = { ...(sites[o] ?? { origin: o }), savedAt: now, updatedAt: now };
        return { ...d, sites };
      });
      const host = origin ? new URL(origin).hostname : null;
      return { saved: origin ?? 'all', cookies: host ? copy.cookies.filter((c) => cookieOnSite(c.domain, host)).length : copy.cookies.length, total_cookies: merged.cookies.length };
    },
  },
  {
    name: 'logins',
    title: 'Known logins',
    description: 'The sites this browser knows: username, whether a password is stored (never the password), notes, and when the login was last saved for every copy.',
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      return { logins: Object.values(ctx.state.data.sites ?? {}).map(siteView) };
    },
  },
  {
    name: 'remember_login',
    title: 'Store a login',
    description:
      'Store or change the login for a site: username, password (or generate_password for a new strong one when signing up), and notes such as which email or plan it uses. The password is never shown again; fill_login types it. forget: true deletes the stored login.',
    inputSchema: schema({
      site: s('The site, e.g. https://github.com or github.com.'),
      username: s('The username or email for that site.'),
      password: s('The password, when you set one yourself.'),
      generate_password: { type: 'boolean', description: 'Store a new strong random password, for a sign-up.' },
      notes: s('Anything to remember about this account.'),
      forget: { type: 'boolean', description: 'Delete the stored login for this site.' },
    }, ['site']),
    annotations: WRITE,
    async run(args, ctx) {
      const origin = siteOrigin(reqStr(args, 'site'));
      if (args.forget === true) {
        if (!ctx.state.data.sites?.[origin]) throw new ToolInputError(`no stored login for ${origin}`);
        await ctx.update((d) => {
          const { [origin]: _gone, ...sites } = d.sites ?? {};
          return { ...d, sites };
        });
        return { forgot: origin };
      }
      const password = args.generate_password === true ? generatePassword() : optStr(args, 'password');
      const username = optStr(args, 'username');
      const notes = optStr(args, 'notes');
      const now = new Date(ctx.now()).toISOString();
      const data = await ctx.update((d) => {
        const sites = d.sites ?? {};
        if (!sites[origin] && Object.keys(sites).length >= SITES_MAX) throw new ToolInputError(`this browser knows ${SITES_MAX} sites; forget one first`);
        const site: SiteRecord = {
          ...(sites[origin] ?? { origin, updatedAt: now }),
          ...(username !== undefined ? { username } : {}),
          ...(password !== undefined ? { password } : {}),
          ...(notes !== undefined ? { notes } : {}),
          updatedAt: now,
        };
        return { ...d, sites: { ...sites, [origin]: site } };
      });
      return { ...siteView(data.sites![origin]!), password_generated: args.generate_password === true };
    },
  },
  {
    name: 'fill_login',
    title: 'Fill the stored login',
    description:
      'Type the stored username and password into the sign-in or sign-up form open in your copy (the tab on `site`, or the first tab), from Kortix straight into the page: the password never passes through you. Every visible password field is filled, so a "confirm password" field works. submit presses Enter.',
    inputSchema: schema({ site: s('Which stored login; also picks the tab on that site. Default: the first tab\'s site.'), submit: { type: 'boolean', description: 'Press Enter after filling.' } }),
    annotations: WRITE,
    async run(args, ctx) {
      const named = optStr(args, 'site');
      const want = named ? siteOrigin(named) : null;
      return onCopyPage(ctx, want, async (page) => {
        const origin = want ?? siteOrigin((await pageInfo(page)).url);
        const site = ctx.state.data.sites?.[origin];
        if (!site || (!site.username && !site.password)) throw new ToolInputError(`no stored login for ${origin}; remember_login stores one`);
        const { username, password, ...info } = await fillLogin(page, { username: site.username, password: site.password }, args.submit === true);
        return { site: origin, filled_username: username, filled_password: password, url: info.url, title: info.title };
      });
    },
  },
  {
    name: 'reset',
    title: 'Reset the browser',
    description: 'Close every copy and delete every saved login and stored password. The next connect starts signed out everywhere.',
    inputSchema: schema({ confirm: s('Type "reset" to confirm.') }, ['confirm']),
    annotations: DESTRUCTIVE,
    async run(args, ctx) {
      if (args.confirm !== 'reset') throw new ToolInputError('pass confirm: "reset"');
      const { copies, profileId, scratchProfileId } = ctx.state.data;
      await Promise.all(Object.values(copies ?? {}).map((c) => api.remove(c.browserId)));
      if (profileId) await api.deleteProfile(profileId);
      if (scratchProfileId) await api.deleteProfile(scratchProfileId);
      await ctx.update(() => ({}));
      return { reset: true, closed: Object.keys(copies ?? {}).length };
    },
  },
];
