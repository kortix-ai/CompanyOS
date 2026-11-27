/**
 * `kortix_toolbox`: Kortix Toolbox, the first Kortix-managed connector. Paid
 * tools with no sign-in, billed to the workspace's credits:
 *
 * - search (Tavily), scrape and map (Firecrawl), image_search (Serper), on
 *   Kortix's own keys, on the same billed path as the router proxy the
 *   built-in tools use (`router/services/billed-proxy.ts`);
 * - find_tools, describe_tool and call_tool: the long tail, thousands of data
 *   tools on hosted treg.to (./treg.ts), billed at the real cost of each call
 *   times the `toolbox_catalog` markup, held before and settled after.
 *
 * As a connector every call also passes the gateway's rules, approvals and
 * call log. The account holds no state: its credential only names the
 * workspace.
 */
import { HTTPException } from 'hono/http-exception';
import { getProxyServices } from '../../router/config/proxy-services';
import { callKortixProxy } from '../../router/services/billed-proxy';
import { getToolMarkup } from '../../config';
import { reserveToolAmount, settleToolAmount } from '../../router/services/proxy-billing';
import { accountKeyOfWorkspace } from '../../workspaces/rows';
import { offerable, treg, tregConfigured, type TregEndpoint, tregMeta } from './treg';
import { type AgentTool, i, optInt, optStr, READ, reqStr, s, schema, ToolInputError, WRITE } from './tool';

type Service = 'tavily' | 'firecrawl' | 'serper';

/** One billed call; the provider's JSON, or a tool error a model can act on. */
export type WebCall = (input: { projectId: string; service: Service; path: string; body: Record<string, unknown> }) => Promise<unknown>;

const billedCall: WebCall = async ({ projectId, service, path, body }) => {
  // Read fresh: a workspace moved to another account bills the new one at once.
  const accountId = await accountKeyOfWorkspace(projectId);
  if (!accountId) throw new ToolInputError('this workspace has no billing account');
  let response: Response;
  try {
    response = await callKortixProxy({
      service: getProxyServices()[service]!,
      accountId,
      method: 'POST',
      subPath: path,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch (error) {
    // No credits (402), a busy billing store (503), a refused URL (400): the agent can act on each.
    if (error instanceof HTTPException) throw new ToolInputError(`${error.status === 402 ? 'not enough credits' : 'refused'}: ${error.message}`);
    throw error;
  }
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON: the status and text below
  }
  if (!response.ok) {
    const message = (json as { message?: string; error?: string } | null)?.message ?? (json as { error?: string } | null)?.error ?? text.slice(0, 300);
    throw new ToolInputError(`${service} answered ${response.status}: ${message}`);
  }
  return json;
};

let call: WebCall = billedCall;
/** Tests replace the billed call; never called in production. */
export function setWebCallForTests(next: WebCall | null): void {
  call = next ?? billedCall;
}

interface TavilyResult { title?: string; url?: string; content?: string; score?: number; published_date?: string }
interface TavilyResponse { answer?: string; results?: TavilyResult[]; images?: Array<string | { url?: string; description?: string }>; response_time?: number }

const URL_LIST_MAX = 10;

function urlList(args: Record<string, unknown>): string[] {
  const many = Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === 'string' && u.trim() !== '') : [];
  const one = optStr(args, 'url');
  const urls = [...(one ? [one] : []), ...many].map((u) => u.trim());
  if (urls.length === 0) throw new ToolInputError('give url, or urls');
  if (urls.length > URL_LIST_MAX) throw new ToolInputError(`at most ${URL_LIST_MAX} urls per call`);
  for (const u of urls) if (!/^https?:\/\//i.test(u)) throw new ToolInputError(`${u} must start with https:// or http://`);
  return urls;
}

const clamp = (value: number | undefined, low: number, high: number, fallback: number) => Math.min(Math.max(value ?? fallback, low), high);

const NATIVE_TOOLS: readonly AgentTool[] = [
  {
    name: 'search',
    title: 'Search the web',
    description:
      'Web search with a short answer, results (title, url, snippet, date) and related images. topic "news" for current events, "finance" for markets. search_depth "advanced" reads deeper and costs more.',
    inputSchema: schema({
      query: s('What to search for.'),
      num_results: i('Results, 1 to 20. Default 5.'),
      topic: s('general (default), news or finance.'),
      search_depth: s('basic (default) or advanced.'),
      time_range: s('Only results from the last day, week, month or year.'),
    }, ['query']),
    annotations: READ,
    async run(args, ctx) {
      const query = reqStr(args, 'query');
      const topic = optStr(args, 'topic') ?? 'general';
      if (!['general', 'news', 'finance'].includes(topic)) throw new ToolInputError('topic is general, news or finance');
      const depth = optStr(args, 'search_depth') ?? 'basic';
      if (!['basic', 'advanced'].includes(depth)) throw new ToolInputError('search_depth is basic or advanced');
      const timeRange = optStr(args, 'time_range');
      if (timeRange && !['day', 'week', 'month', 'year'].includes(timeRange)) throw new ToolInputError('time_range is day, week, month or year');
      const data = (await call({
        projectId: ctx.state.projectId,
        service: 'tavily',
        path: '/search',
        body: {
          query,
          search_depth: depth,
          topic,
          max_results: clamp(optInt(args, 'num_results'), 1, 20, 5),
          include_answer: true,
          include_images: true,
          include_image_descriptions: true,
          ...(timeRange ? { time_range: timeRange } : {}),
        },
      })) as TavilyResponse;
      return {
        query,
        answer: data.answer ?? '',
        results: (data.results ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.content ?? '', score: r.score ?? 0, published_date: r.published_date ?? '' })),
        images: (data.images ?? []).map((image) => (typeof image === 'string' ? { url: image, description: '' } : { url: image.url ?? '', description: image.description ?? '' })),
      };
    },
  },
  {
    name: 'scrape',
    title: 'Read web pages',
    description: `Read up to ${URL_LIST_MAX} pages as clean markdown (Firecrawl), with title and metadata. A page that fails is reported in its own entry; the others still return. For a page behind a login, use the Kortix Browser.`,
    inputSchema: schema({
      url: s('One page.'),
      urls: { type: 'array', items: { type: 'string' }, description: `Several pages, at most ${URL_LIST_MAX}.` },
      include_html: { type: 'boolean', description: 'Also return the raw HTML.' },
    }),
    annotations: READ,
    async run(args, ctx) {
      const urls = urlList(args);
      const includeHtml = args.include_html === true;
      const pages = await Promise.all(
        urls.map(async (url) => {
          try {
            const r = (await call({
              projectId: ctx.state.projectId,
              service: 'firecrawl',
              path: '/v2/scrape',
              body: { url, formats: includeHtml ? ['markdown', 'html'] : ['markdown'], timeout: 30_000 },
            })) as { success?: boolean; error?: string; data?: { markdown?: string; html?: string; metadata?: Record<string, unknown> } };
            if (r.success === false) return { url, success: false, error: r.error ?? 'the page could not be read' };
            const data = r.data ?? {};
            const markdown = data.markdown ?? '';
            return {
              url,
              success: true,
              title: String(data.metadata?.title ?? ''),
              content: markdown,
              content_length: markdown.length,
              ...(includeHtml && data.html ? { html: data.html } : {}),
              ...(data.metadata ? { metadata: data.metadata } : {}),
            };
          } catch (error) {
            return { url, success: false, error: error instanceof Error ? error.message : String(error) };
          }
        }),
      );
      return { pages };
    },
  },
  {
    name: 'map',
    title: 'List a site\'s pages',
    description: 'The URLs of a site (Firecrawl map), optionally only those matching search, e.g. "pricing". Then scrape the ones you need.',
    inputSchema: schema({ url: s('The site, e.g. https://docs.example.com.'), search: s('Only URLs about this.'), limit: i('At most this many, 1 to 500. Default 100.') }, ['url']),
    annotations: READ,
    async run(args, ctx) {
      const url = reqStr(args, 'url');
      if (!/^https?:\/\//i.test(url)) throw new ToolInputError('url must start with https:// or http://');
      const search = optStr(args, 'search');
      const r = (await call({
        projectId: ctx.state.projectId,
        service: 'firecrawl',
        path: '/v2/map',
        body: { url, limit: clamp(optInt(args, 'limit'), 1, 500, 100), ...(search ? { search } : {}) },
      })) as { links?: Array<string | { url?: string; title?: string }> };
      const links = (r.links ?? []).map((l) => (typeof l === 'string' ? { url: l, title: '' } : { url: l.url ?? '', title: l.title ?? '' }));
      return { site: url, total: links.length, links };
    },
  },
  {
    name: 'image_search',
    title: 'Search images',
    description: 'Image search (Google Images through Serper): image URL, title, the page it is on, and its size.',
    inputSchema: schema({ query: s('What to find, with names and specifics.'), num_results: i('Images, 1 to 100. Default 12.') }, ['query']),
    annotations: READ,
    async run(args, ctx) {
      const query = reqStr(args, 'query');
      const r = (await call({
        projectId: ctx.state.projectId,
        service: 'serper',
        path: '/images',
        body: { q: query, num: clamp(optInt(args, 'num_results'), 1, 100, 12) },
      })) as { images?: Array<{ imageUrl: string; title?: string; link?: string; imageWidth?: number; imageHeight?: number }> };
      const images = (r.images ?? []).map((image) => ({ url: image.imageUrl, title: image.title ?? '', source: image.link ?? '', width: image.imageWidth ?? 0, height: image.imageHeight ?? 0 }));
      return { query, total: images.length, images };
    },
  },
];

/** The workspace's billing account and the hold-then-settle billing of a catalog call. Tests replace them. */
interface CatalogBilling {
  accountOf(projectId: string): Promise<string | null>;
  reserve: typeof reserveToolAmount;
  settle: typeof settleToolAmount;
}
const realBilling: CatalogBilling = { accountOf: accountKeyOfWorkspace, reserve: reserveToolAmount, settle: settleToolAmount };
let billing: CatalogBilling = realBilling;
/** Tests replace the billing; never called in production. */
export function setCatalogBillingForTests(next: CatalogBilling | null): void {
  billing = next ?? realBilling;
}

/** One catalog call may cost at most this much (USD), before the markup: treg refuses anything above it unbilled. */
export const CATALOG_CALL_MAX_USD = 0.5;
/** The ceiling for a generation call (an image, a video clip, speech, music). */
export const GENERATION_CALL_MAX_USD = 15;
/** At most this many background tasks are remembered per account. */
const TASKS_KEPT = 100;

/** A generation tool: its id or platform names image, video, voice or music generation. Pure. */
export function isGeneration(e: TregEndpoint): boolean {
  return /\.(image|video|voice|music)-gen\./.test(e.id) || /(image|video|voice|music)-gen/.test(String(e.platform ?? ''));
}

const callCeiling = (e: TregEndpoint) => (isGeneration(e) ? GENERATION_CALL_MAX_USD : CATALOG_CALL_MAX_USD);

/** A background task this account started: what it costs and how to read its result. */
interface TaskRecord {
  tool: string;
  /** What the workspace was charged (USD, markup included); refunded once if the task fails. */
  charged: number;
  state: string;
  refunded?: boolean;
  resultPath?: string;
  success?: string[];
  failure?: string[];
  startedAt: string;
}

interface ToolboxData {
  tasks?: Record<string, TaskRecord>;
}

/** The value at a dotted path (`output`, `data.video.url`). Pure. */
function at(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((v, key) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined), value);
}

/** USD → credits (1 credit = $0.01), rounded to 3 places. Pure. */
const credits = (usd: number) => Math.round(usd * 100 * 1000) / 1000;

/** The markup on a catalog call's real cost (`toolbox_catalog` in the tool prices). */
const markup = () => getToolMarkup('toolbox_catalog');

function catalogEntry(e: TregEndpoint) {
  return {
    id: e.id,
    name: e.name ?? e.id,
    summary: e.summary ?? '',
    kind: e.kind ?? null,
    method: e.method ?? 'GET',
    credits_per_call: typeof e.cost?.usd === 'number' ? credits(e.cost.usd * markup()) : null,
    ...(e.cost?.type && e.cost.type !== 'per_call' ? { priced: e.cost.type } : {}),
  };
}

async function offerableEndpoint(id: string): Promise<TregEndpoint> {
  const e = await treg().get(id);
  if (!e) throw new ToolInputError(`no tool ${id}; find_tools lists them`);
  if (!offerable(e)) {
    throw new ToolInputError(
      e.scope === 'own_account'
        ? `${id} acts on an account of your own; connect that app as a regular connector instead`
        : `${id} is not available in Toolbox (no price on Kortix's account, or it runs as a background task)`,
    );
  }
  return e;
}

const CATALOG_TOOLS: readonly AgentTool[] = [
  {
    name: 'find_tools',
    title: 'Find a tool',
    description:
      'Search thousands of paid data tools by what you need done: people and company data, email finding and checking, SEO and keywords, social profiles and posts, jobs, market data, maps, reviews, more search engines and scrapers. Each result has an id for describe_tool and call_tool and its price in credits. Tools that act on your own accounts (ads, analytics, posting) are regular connectors, not here.',
    inputSchema: schema({ query: s('What you want to do, e.g. "find a work email", "keyword search volume".'), limit: i('Results, 1 to 20. Default 10.') }, ['query']),
    annotations: READ,
    async run(args) {
      if (!tregConfigured()) throw new ToolInputError('the Toolbox catalog is not set up on this Kortix server');
      const query = reqStr(args, 'query');
      const limit = clamp(optInt(args, 'limit'), 1, 20, 10);
      // Ask for more than shown: some results are not offerable here.
      const found = (await treg().search(query, Math.min(limit * 3, 60))).filter(offerable).slice(0, limit);
      return { query, tools: found.map(catalogEntry) };
    },
  },
  {
    name: 'describe_tool',
    title: 'Describe a tool',
    description: 'One catalog tool: what it does, its parameters (query or body), an example, and its price in credits. Read it before call_tool.',
    inputSchema: schema({ id: s('The tool id from find_tools.') }, ['id']),
    annotations: READ,
    async run(args) {
      if (!tregConfigured()) throw new ToolInputError('the Toolbox catalog is not set up on this Kortix server');
      const e = await offerableEndpoint(reqStr(args, 'id'));
      return {
        ...catalogEntry(e),
        input: e.input ?? null,
        ...(e.test_request ? { example: e.test_request } : {}),
        docs_url: e.docs_url || null,
      };
    },
  },
  {
    name: 'call_tool',
    title: 'Run a tool',
    description: `Run one catalog tool: query parameters in query, a JSON body in body, as describe_tool lists them. Billed to the workspace at the call's real cost; a call that would cost more than ${credits(CATALOG_CALL_MAX_USD * getToolMarkup('toolbox_catalog'))} credits is refused unbilled. A tool's own error (no result, bad parameter) costs nothing.`,
    inputSchema: schema({
      id: s('The tool id from find_tools.'),
      query: { type: 'object', additionalProperties: true, description: 'Query parameters, e.g. {"domain": "example.com"}.' },
      body: { type: 'object', additionalProperties: true, description: 'The JSON body, for a POST tool.' },
    }, ['id']),
    annotations: WRITE,
    async run(args, ctx) {
      if (!tregConfigured()) throw new ToolInputError('the Toolbox catalog is not set up on this Kortix server');
      const e = await offerableEndpoint(reqStr(args, 'id'));
      const accountId = await billing.accountOf(ctx.state.projectId);
      if (!accountId) throw new ToolInputError('this workspace has no billing account');
      const query = args.query && typeof args.query === 'object' ? Object.fromEntries(Object.entries(args.query as Record<string, unknown>).map(([k, v]) => [k, String(v)])) : undefined;
      const body = args.body && typeof args.body === 'object' ? args.body : undefined;
      const rate = markup();
      const ceiling = callCeiling(e);
      const estimate = Math.min(Math.max(e.cost?.usd ?? 0, 0), ceiling);
      const description = `Toolbox ${e.id}`;
      let hold;
      try {
        hold = await billing.reserve(accountId, estimate * rate, description);
      } catch (error) {
        throw new ToolInputError(`not enough credits for this call: ${error instanceof Error ? error.message : String(error)}`);
      }
      let result;
      try {
        result = await treg().call({ id: e.id, method: e.method ?? 'GET', query, body, meta: tregMeta({ workspaceId: ctx.state.projectId, sessionId: ctx.sessionId }), maxCostUsd: ceiling });
      } catch (error) {
        await billing.settle(hold, 0, description);
        throw error;
      }
      const actual = (result.costMicro / 1_000_000) * rate;
      await billing.settle(hold, actual, description);
      if (result.async && result.callId && result.status < 400) {
        // A background task: treg holds its cost now and refunds it if the task fails; check_task follows it.
        const task: TaskRecord = {
          tool: e.id,
          charged: actual,
          state: 'processing',
          resultPath: result.async.result?.path,
          success: result.async.status?.success,
          failure: result.async.status?.failure,
          startedAt: new Date(ctx.now()).toISOString(),
        };
        const callId = result.callId;
        await ctx.update((d) => {
          const tasks = { ...((d as ToolboxData).tasks ?? {}), [callId]: task };
          const kept = Object.entries(tasks).slice(-TASKS_KEPT);
          return { ...d, tasks: Object.fromEntries(kept) };
        });
        return { id: e.id, task: callId, state: 'processing', credits: credits(actual), next: 'check_task with this task id until done (images take seconds, videos 1-5 minutes)' };
      }
      return { id: e.id, status: result.status, ok: result.status < 400, credits: credits(actual), result: result.body };
    },
  },
];

const TASK_TOOLS: readonly AgentTool[] = [
  {
    name: 'check_task',
    title: 'Check a background task',
    description:
      'The state of a task call_tool started (image or video generation): processing, succeeded with its result (usually file links, valid for about a day: download them now), or failed, which refunds its credits. Call again while it is processing; wait_seconds waits up to 60 seconds for it to finish.',
    inputSchema: schema({ task: s('The task id from call_tool.'), wait_seconds: i('Wait up to this long for it to finish, 0 to 60. Default 0.') }, ['task']),
    annotations: READ,
    async run(args, ctx) {
      const id = reqStr(args, 'task');
      const record = ((ctx.state.data as ToolboxData).tasks ?? {})[id];
      if (!record) throw new ToolInputError(`no task ${id} in this account; call_tool starts one`);
      const deadline = ctx.now() + Math.min(Math.max(optInt(args, 'wait_seconds', 0) ?? 0, 0), 60) * 1000;
      for (;;) {
        const task = await treg().task(id);
        if (!task) throw new ToolInputError(`treg has no task ${id}`);
        const status = String(at(task.body, 'status') ?? task.state);
        const failed = task.state === 'failed' || (record.failure ?? []).includes(status);
        const succeeded = task.state === 'succeeded' || (record.success ?? []).includes(status);
        if (failed) {
          let refunded = false;
          await ctx.update((d) => {
            const tasks = { ...((d as ToolboxData).tasks ?? {}) };
            const current = tasks[id];
            if (current && !current.refunded) {
              refunded = true;
              tasks[id] = { ...current, state: 'failed', refunded: true };
            }
            return { ...d, tasks };
          });
          if (refunded && record.charged > 0) {
            const accountId = await billing.accountOf(ctx.state.projectId);
            if (accountId) await billing.settle({ accountId, billingToolName: 'toolbox_catalog', cost: record.charged }, 0, `Toolbox ${record.tool} task failed`);
          }
          return { task: id, tool: record.tool, state: 'failed', refunded_credits: credits(record.charged), error: at(task.body, 'error') ?? null };
        }
        if (succeeded) {
          await ctx.update((d) => {
            const tasks = { ...((d as ToolboxData).tasks ?? {}) };
            if (tasks[id]) tasks[id] = { ...tasks[id]!, state: 'succeeded' };
            return { ...d, tasks };
          });
          return { task: id, tool: record.tool, state: 'succeeded', result: at(task.body, record.resultPath) ?? task.body, credits: credits(record.charged) };
        }
        if (ctx.now() >= deadline) return { task: id, tool: record.tool, state: 'processing', status };
        await sleepFor(2_000);
      }
    },
  },
];

let sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Tests make waits instant; never called in production. */
export function setToolboxSleepForTests(fn: ((ms: number) => Promise<void>) | null): void {
  sleepFor = fn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
}

export const TOOLBOX_TOOLS: readonly AgentTool[] = [...NATIVE_TOOLS, ...CATALOG_TOOLS, ...TASK_TOOLS];
