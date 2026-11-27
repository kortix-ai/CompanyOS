/**
 * `kortix_browser`: an agent's own browser, a Platinum Browser (a Chromium on
 * Platinum whose profile stays on its disk). One per account: every session
 * that uses the account drives the same browser, so one login serves them all.
 *
 * Every page action (open, snapshot, click, type, read, screenshot) runs here,
 * over CDP (./browser-page.ts), so each one passes the connector gateway: its
 * rules, its approvals and its call log. The CDP URL stays on the server.
 * `connect` is the one exception, a raw CDP URL for agent-browser; the history
 * records each one handed out.
 *
 * The account keeps, in its encrypted state:
 * - `sites`: one record per site origin: the login (username, a password that
 *   is never returned, notes) and when it was last signed in and saved;
 * - `history`: the last {@link HISTORY_MAX} pages and actions;
 * - the browser, its saved profile and the tab in use.
 */
import { randomBytes } from 'node:crypto';
import { PlatinumHttpError, platinumJson } from '../../shared/platinum';
import { CdpConnection } from './cdp';
import * as pages from './browser-page';
import { type AgentTool, DESTRUCTIVE, i, optInt, optStr, READ, reqStr, s, schema, ToolInputError, WRITE } from './tool';

export const HISTORY_MAX = 200;
export const SITES_MAX = 500;

export interface SiteRecord {
  origin: string;
  username?: string;
  /** Never returned by a tool; `fill_login` types it into the page. */
  password?: string;
  notes?: string;
  /** When the agent last said it is signed in here (`remember_site signed_in`). */
  signedInAt?: string;
  /** When `save_login` last backed up this site's cookies. */
  savedAt?: string;
  updatedAt: string;
}

export interface HistoryEntry {
  at: string;
  action: string;
  url?: string;
  title?: string;
  status?: number | null;
}

export interface BrowserData {
  /** The Platinum browser this account drives. */
  browserId?: string;
  /** The Platinum saved profile its logins are backed up to. */
  profileId?: string;
  createdAt?: string;
  /** The tab page actions use (a CDP target id). */
  tab?: string;
  sites?: Record<string, SiteRecord>;
  history?: HistoryEntry[];
}

export interface PlatinumBrowser {
  id: string;
  status: string;
  region?: string | null;
  cdp_url?: string;
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

/** Opens the CDP connection. Tests replace it with a fake browser. */
export type CdpOpener = (url: string) => Promise<CdpConnection>;

/** Pause after this many idle minutes; the next action wakes it. */
export const BROWSER_IDLE_MINUTES = 30;
/** A pooled connection closes after this long unused. */
const POOL_IDLE_MS = 120_000;
const CDP_TTL_SECONDS = 900;
const GONE = new Set(['deleted', 'failed']);

// replica-local: open CDP sockets of this process, one per browser; any replica opens its own on demand.
const POOL = new Map<string, { conn: CdpConnection; idle: ReturnType<typeof setTimeout> }>();

function dropConnection(browserId: string): void {
  const entry = POOL.get(browserId);
  if (!entry) return;
  clearTimeout(entry.idle);
  entry.conn.close();
  POOL.delete(browserId);
}

function touch(browserId: string, conn: CdpConnection): void {
  const previous = POOL.get(browserId);
  if (previous) clearTimeout(previous.idle);
  const idle = setTimeout(() => dropConnection(browserId), POOL_IDLE_MS);
  idle.unref?.();
  POOL.set(browserId, { conn, idle });
}

let api: BrowserApi = platinumBrowsers;
let openCdp: CdpOpener = (url) => CdpConnection.open(url);
/** Tests replace Platinum and the CDP socket; never called in production. */
export function setBrowserApiForTests(next: BrowserApi | null, opener?: CdpOpener | null): void {
  api = next ?? platinumBrowsers;
  openCdp = opener ?? ((url) => CdpConnection.open(url));
  for (const id of [...POOL.keys()]) dropConnection(id);
}

type Ctx = Parameters<AgentTool<BrowserData>['run']>[1];

const appendHistory = (data: BrowserData, entry: HistoryEntry): BrowserData => ({
  ...data,
  history: [...(data.history ?? []), entry].slice(-HISTORY_MAX),
});

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
  const createdAt = new Date(ctx.now()).toISOString();
  await ctx.update(({ tab: _tab, ...d }) => ({ ...d, browserId: created.id, createdAt }));
  return created;
}

async function mintCdpUrl(browserId: string, ttl: number): Promise<{ cdp_url: string; expires_at: string }> {
  try {
    return await api.cdpUrl(browserId, ttl);
  } catch (error) {
    // Platinum restarts a browser that stopped answering within about a minute.
    if (error instanceof PlatinumHttpError && error.status === 503) {
      throw new ToolInputError('the browser is restarting; try again in about a minute');
    }
    throw error;
  }
}

/** The browser's CDP connection on this replica, opened (and the browser started) when needed. */
async function connection(ctx: Ctx): Promise<{ conn: CdpConnection; browserId: string }> {
  const browserId = ctx.state.data.browserId;
  const pooled = browserId ? POOL.get(browserId) : undefined;
  if (browserId && pooled && !pooled.conn.closed) {
    touch(browserId, pooled.conn);
    return { conn: pooled.conn, browserId };
  }
  const browser = await ensureBrowser(ctx);
  const url = await mintCdpUrl(browser.id, CDP_TTL_SECONDS);
  const conn = await openCdp(url.cdp_url);
  touch(browser.id, conn);
  return { conn, browserId: browser.id };
}

/** Run `fn` on the account's current tab. A dropped connection is reopened once. */
async function withPage<T>(ctx: Ctx, fn: (page: pages.Page) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { conn, browserId } = await connection(ctx);
    try {
      const page = await pages.attachPage(conn, ctx.state.data.tab);
      if (page.targetId !== ctx.state.data.tab) await ctx.update((d) => ({ ...d, tab: page.targetId }));
      return await fn(page);
    } catch (error) {
      if (conn.closed && attempt === 0) {
        dropConnection(browserId);
        continue;
      }
      throw error;
    }
  }
}

/** The tool's page result, and the history entry when the page changed. */
async function recorded(ctx: Ctx, action: string, before: string | null, info: pages.PageInfo, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  if (action === 'open' || info.url !== before) {
    const at = new Date(ctx.now()).toISOString();
    await ctx.update((d) => appendHistory(d, { at, action, url: info.url, title: info.title, status: info.status }));
  }
  return { url: info.url, title: info.title, status: info.status, ...extra };
}

async function currentUrl(page: pages.Page): Promise<string | null> {
  try {
    return (await pages.pageInfo(page)).url;
  } catch {
    return null;
  }
}

function targetArg(args: Record<string, unknown>, required: boolean): pages.Target | null {
  const target = { ref: optStr(args, 'ref'), selector: optStr(args, 'selector'), text: optStr(args, 'text_match') };
  if (target.ref || target.selector || target.text) return target;
  if (required) throw new ToolInputError('name the element: ref (from snapshot), selector, or text_match');
  return null;
}

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

const siteView = (site: SiteRecord) => ({
  site: site.origin,
  username: site.username ?? null,
  has_password: Boolean(site.password),
  notes: site.notes ?? null,
  signed_in_at: site.signedInAt ?? null,
  saved_at: site.savedAt ?? null,
  updated_at: site.updatedAt,
});

const TARGET_PROPS = {
  ref: s('The element ref from snapshot, e.g. e12.'),
  selector: s('A CSS selector, when there is no ref.'),
  text_match: s('The element\'s visible text, when there is no ref, e.g. "Sign in".'),
};

const PAGE_TOOLS: readonly AgentTool<BrowserData>[] = [
  {
    name: 'open',
    title: 'Open a page',
    description: 'Open a URL in the account\'s browser (started or woken as needed) and wait for it to load. Returns the final URL, title and HTTP status. Then call snapshot to see what is on it.',
    inputSchema: schema({ url: s('The address, e.g. https://github.com/login.'), new_tab: { type: 'boolean', description: 'Open it in a new tab and use that tab from now on.' } }, ['url']),
    annotations: WRITE,
    async run(args, ctx) {
      const url = reqStr(args, 'url');
      if (!/^https?:\/\//i.test(url) && url !== 'about:blank') throw new ToolInputError('url must start with https:// or http://');
      if (args.new_tab === true) {
        const { conn } = await connection(ctx);
        const tab = await pages.newTab(conn);
        await ctx.update((d) => ({ ...d, tab }));
      }
      return withPage(ctx, async (page) => recorded(ctx, 'open', await currentUrl(page), await pages.navigate(page, url)));
    },
  },
  {
    name: 'snapshot',
    title: 'See the page',
    description: `The interactive elements of the current page (links, buttons, fields) with a ref each, e.g. e12, for click and type. At most ${pages.SNAPSHOT_MAX_ELEMENTS}. Refs last until the next snapshot or page change. Password values are never shown.`,
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      return withPage(ctx, (page) => pages.snapshot(page));
    },
  },
  {
    name: 'click',
    title: 'Click',
    description: 'Click an element with a real mouse click, and wait for the page it opens, if any. Name it by ref (from snapshot), selector or text_match.',
    inputSchema: schema(TARGET_PROPS),
    annotations: WRITE,
    async run(args, ctx) {
      const target = targetArg(args, true)!;
      return withPage(ctx, async (page) => recorded(ctx, 'click', await currentUrl(page), await pages.click(page, target)));
    },
  },
  {
    name: 'type',
    title: 'Type',
    description: 'Click a field and type text into it as keyboard input. Without ref, selector or text_match, types where the focus is. For a stored password use fill_login instead, so the password never passes through you.',
    inputSchema: schema({ ...TARGET_PROPS, text: s('What to type.'), clear: { type: 'boolean', description: 'Empty the field first.' }, submit: { type: 'boolean', description: 'Press Enter after typing.' } }, ['text']),
    annotations: WRITE,
    async run(args, ctx) {
      const text = reqStr(args, 'text');
      const target = targetArg(args, false);
      return withPage(ctx, async (page) =>
        recorded(ctx, 'type', await currentUrl(page), await pages.type(page, target, text, { clear: args.clear === true, submit: args.submit === true })),
      );
    },
  },
  {
    name: 'press',
    title: 'Press a key',
    description: `Press one key on the focused element: ${pages.KEY_NAMES.join(', ')}.`,
    inputSchema: schema({ key: s('The key name, e.g. Enter.') }, ['key']),
    annotations: WRITE,
    async run(args, ctx) {
      const key = reqStr(args, 'key');
      return withPage(ctx, async (page) => recorded(ctx, 'press', await currentUrl(page), await pages.press(page, key)));
    },
  },
  {
    name: 'read',
    title: 'Read the page',
    description: `The current page's visible text (default), its links, or its HTML, ${pages.READ_MAX_CHARS} characters at a time: pass next_offset back as offset for the rest.`,
    inputSchema: schema({ mode: s('text (default), links or html.'), offset: i('Where to continue, from next_offset.') }),
    annotations: READ,
    async run(args, ctx) {
      const mode = (optStr(args, 'mode') ?? 'text') as 'text' | 'links' | 'html';
      if (!['text', 'links', 'html'].includes(mode)) throw new ToolInputError('mode is text, links or html');
      return withPage(ctx, (page) => pages.read(page, mode, Math.max(0, optInt(args, 'offset', 0) ?? 0)));
    },
  },
  {
    name: 'screenshot',
    title: 'Screenshot',
    description: 'A JPEG of the current page (the viewport, or full_page up to 8000 px tall), at most 1 MB. `kortix connectors call` saves it as a file and prints the path.',
    inputSchema: schema({ full_page: { type: 'boolean', description: 'The whole page, not only the visible part.' } }),
    annotations: READ,
    async run(args, ctx) {
      return withPage(ctx, async (page) => ({ ...(await pages.pageInfo(page)), file_name: 'screenshot.jpg', ...(await pages.screenshot(page, args.full_page === true)) }));
    },
  },
  {
    name: 'tabs',
    title: 'List tabs',
    description: 'The open tabs, and which one page actions use. A sign-in popup opens as a new tab: switch_tab to it.',
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      const { conn } = await connection(ctx);
      const tabs = await pages.listTabs(conn);
      return { tabs: tabs.map((t) => ({ ...t, current: t.id === ctx.state.data.tab })) };
    },
  },
  {
    name: 'switch_tab',
    title: 'Switch tab',
    description: 'Use another open tab for the next page actions; tabs lists their ids.',
    inputSchema: schema({ id: s('The tab id from tabs.') }, ['id']),
    annotations: WRITE,
    async run(args, ctx) {
      const id = reqStr(args, 'id');
      const { conn } = await connection(ctx);
      if (!(await pages.listTabs(conn)).some((t) => t.id === id)) throw new ToolInputError(`no tab ${id}; tabs lists them`);
      await ctx.update((d) => ({ ...d, tab: id }));
      return withPage(ctx, (page) => pages.pageInfo(page));
    },
  },
  {
    name: 'close_tab',
    title: 'Close a tab',
    description: 'Close one tab. Closing the one in use switches to the first remaining tab.',
    inputSchema: schema({ id: s('The tab id from tabs.') }, ['id']),
    annotations: WRITE,
    async run(args, ctx) {
      const id = reqStr(args, 'id');
      const { conn } = await connection(ctx);
      await pages.closeTab(conn, id);
      if (ctx.state.data.tab === id) await ctx.update(({ tab: _tab, ...d }) => d);
      return { closed: id };
    },
  },
  {
    name: 'evaluate',
    title: 'Run page script',
    description: 'Run a JavaScript expression in the current page and return its JSON value. For what the other actions cannot do; prefer them.',
    inputSchema: schema({ script: s('A JavaScript expression, e.g. document.querySelectorAll("tr").length.') }, ['script']),
    annotations: WRITE,
    async run(args, ctx) {
      const script = reqStr(args, 'script');
      return withPage(ctx, async (page) => ({ value: await pages.runScript(page, script) }));
    },
  },
];

const SITE_TOOLS: readonly AgentTool<BrowserData>[] = [
  {
    name: 'sites',
    title: 'Known sites',
    description: 'The sites this browser has logins for: username, whether a password is stored (never the password), notes, and when it last signed in and saved the login.',
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      return { sites: Object.values(ctx.state.data.sites ?? {}).map(siteView) };
    },
  },
  {
    name: 'remember_site',
    title: 'Remember a login',
    description:
      'Store or change the login for a site: username, password (or generate_password for a new strong one when signing up), notes, and signed_in when you are signed in there now. The password is never shown again; fill_login types it.',
    inputSchema: schema({
      site: s('The site, e.g. https://github.com or github.com.'),
      username: s('The username or email for that site.'),
      password: s('The password, when you set one yourself.'),
      generate_password: { type: 'boolean', description: 'Store a new strong random password, for a sign-up.' },
      notes: s('Anything to remember about this account: plan, recovery, which email it uses.'),
      signed_in: { type: 'boolean', description: 'You are signed in to this site now.' },
    }, ['site']),
    annotations: WRITE,
    async run(args, ctx) {
      const origin = siteOrigin(reqStr(args, 'site'));
      const password = args.generate_password === true ? generatePassword() : optStr(args, 'password');
      const username = optStr(args, 'username');
      const notes = optStr(args, 'notes');
      const now = new Date(ctx.now()).toISOString();
      const data = await ctx.update((d) => {
        const sites = d.sites ?? {};
        if (!sites[origin] && Object.keys(sites).length >= SITES_MAX) throw new ToolInputError(`this browser remembers ${SITES_MAX} sites; forget one first`);
        const site: SiteRecord = {
          ...(sites[origin] ?? { origin, updatedAt: now }),
          ...(username !== undefined ? { username } : {}),
          ...(password !== undefined ? { password } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(args.signed_in === true ? { signedInAt: now } : {}),
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
      'Type the stored username and password for the current page\'s site (or `site`) into its sign-in or sign-up form, from Kortix straight into the page: the password never passes through you. Every visible password field is filled, so a "confirm password" field works. submit presses Enter.',
    inputSchema: schema({ site: s('Which stored login, when it is not the current page\'s site.'), submit: { type: 'boolean', description: 'Press Enter after filling.' } }),
    annotations: WRITE,
    async run(args, ctx) {
      return withPage(ctx, async (page) => {
        const before = await currentUrl(page);
        const origin = siteOrigin(optStr(args, 'site') ?? before ?? '');
        const site = ctx.state.data.sites?.[origin];
        if (!site || (!site.username && !site.password)) throw new ToolInputError(`no stored login for ${origin}; remember_site stores one`);
        const { username, password, ...info } = await pages.fillLogin(page, { username: site.username, password: site.password }, args.submit === true);
        return recorded(ctx, 'fill_login', before, info, { site: origin, filled_username: username, filled_password: password });
      });
    },
  },
  {
    name: 'forget_site',
    title: 'Forget a login',
    description: 'Delete the stored login for a site. The browser stays signed in there until its cookies expire or you sign out.',
    inputSchema: schema({ site: s('The site, e.g. https://github.com.') }, ['site']),
    annotations: DESTRUCTIVE,
    async run(args, ctx) {
      const origin = siteOrigin(reqStr(args, 'site'));
      if (!ctx.state.data.sites?.[origin]) throw new ToolInputError(`no stored login for ${origin}`);
      await ctx.update((d) => {
        const { [origin]: _gone, ...sites } = d.sites ?? {};
        return { ...d, sites };
      });
      return { forgot: origin };
    },
  },
  {
    name: 'history',
    title: 'Browser history',
    description: `The last pages and actions of this browser, newest first (at most ${HISTORY_MAX} kept), from every session that used it. Optionally only one site.`,
    inputSchema: schema({ site: s('Only entries on this site.'), limit: i('At most this many, 1 to 200, default 30.') }),
    annotations: READ,
    async run(args, ctx) {
      const site = optStr(args, 'site');
      const origin = site ? siteOrigin(site) : null;
      const limit = Math.min(Math.max(optInt(args, 'limit', 30) ?? 30, 1), HISTORY_MAX);
      const onSite = (e: HistoryEntry) => {
        if (!origin) return true;
        try {
          return e.url ? new URL(e.url).origin.toLowerCase() === origin : false;
        } catch {
          return false;
        }
      };
      return { history: [...(ctx.state.data.history ?? [])].reverse().filter(onSite).slice(0, limit) };
    },
  },
];

const LIFECYCLE_TOOLS: readonly AgentTool<BrowserData>[] = [
  {
    name: 'status',
    title: 'Browser status',
    description: 'Whether this account has a browser and its state (running, paused, starting), the number of known sites, and whether its logins are backed up.',
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      const { browserId, profileId, sites } = ctx.state.data;
      const browser = browserId ? await api.get(browserId) : null;
      return {
        has_browser: Boolean(browser && !GONE.has(browser.status)),
        status: browser?.status ?? 'none',
        region: browser?.region ?? null,
        ...(browser?.last_error ? { last_error: browser.last_error } : {}),
        sites: Object.keys(sites ?? {}).length,
        logins_backed_up: Boolean(profileId),
      };
    },
  },
  {
    name: 'save_login',
    title: 'Back up its logins',
    description: 'Copies the browser\'s cookies and local storage to its saved profile, so a new browser starts signed in. Call it after signing in to a site. Marks each known site whose cookies it saved.',
    inputSchema: schema({}),
    annotations: WRITE,
    async run(_args, ctx) {
      const browser = await ensureBrowser(ctx);
      let profileId = ctx.state.data.profileId;
      if (!profileId) {
        const created = (await api.createProfile(`kortix-${ctx.state.connectionId}`)).id;
        profileId = (await ctx.update((d) => ({ ...d, profileId: d.profileId ?? created }))).profileId!;
      }
      const saved = await api.saveProfile(browser.id, profileId);
      const now = new Date(ctx.now()).toISOString();
      await ctx.update((d) => {
        const sites = { ...(d.sites ?? {}) };
        for (const origin of saved.origins.map((o) => o.toLowerCase())) {
          if (sites[origin]) sites[origin] = { ...sites[origin]!, savedAt: now };
        }
        return appendHistory({ ...d, sites }, { at: now, action: 'save_login' });
      });
      return { saved: true, cookie_count: saved.cookie_count, sites: saved.origins };
    },
  },
  {
    name: 'connect',
    title: 'Raw browser access',
    description:
      'A short-lived CDP URL for agent-browser (`agent-browser --cdp "<cdp_url>" …`), for what the page actions cannot do. What you do over it bypasses these tools, so prefer them. The URL is a credential: never print it in a message or a file.',
    inputSchema: schema({ ttl_seconds: i('How long the URL opens new connections: 60 to 3600, default 900.') }),
    annotations: WRITE,
    async run(args, ctx) {
      const ttl = Math.min(Math.max(optInt(args, 'ttl_seconds', 900) ?? 900, 60), 3600);
      const browser = await ensureBrowser(ctx);
      const url = await mintCdpUrl(browser.id, ttl);
      const at = new Date(ctx.now()).toISOString();
      await ctx.update((d) => appendHistory(d, { at, action: 'connect' }));
      return { status: browser.status, region: browser.region ?? null, cdp_url: url.cdp_url, expires_at: url.expires_at, use: 'agent-browser --cdp "<cdp_url>" <command>' };
    },
  },
  {
    name: 'pause',
    title: 'Pause its browser',
    description: 'Pause the browser to stop paying for it. Its disk and logins stay; open tabs close. The next page action wakes it.',
    inputSchema: schema({}),
    annotations: WRITE,
    async run(_args, ctx) {
      const { browserId } = ctx.state.data;
      if (!browserId) throw new ToolInputError('this account has no browser yet; open starts one');
      dropConnection(browserId);
      await api.pause(browserId);
      return { paused: true };
    },
  },
  {
    name: 'reset',
    title: 'Reset its browser',
    description: 'Delete the browser and its disk. The next page action starts a new one from the saved logins (save_login), or signed out when there are none. Stored site logins and history stay.',
    inputSchema: schema({ confirm: s('Type "reset" to confirm.') }, ['confirm']),
    annotations: DESTRUCTIVE,
    async run(args, ctx) {
      if (args.confirm !== 'reset') throw new ToolInputError('pass confirm: "reset"');
      const { browserId } = ctx.state.data;
      if (browserId) {
        dropConnection(browserId);
        await api.remove(browserId);
      }
      const at = new Date(ctx.now()).toISOString();
      const data = await ctx.update(({ browserId: _b, createdAt: _c, tab: _t, ...d }) => appendHistory(d, { at, action: 'reset' }));
      return { reset: true, logins_backed_up: Boolean(data.profileId) };
    },
  },
];

export const BROWSER_TOOLS: readonly AgentTool<BrowserData>[] = [...PAGE_TOOLS, ...SITE_TOOLS, ...LIFECYCLE_TOOLS];
