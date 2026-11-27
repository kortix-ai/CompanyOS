/**
 * `kortix_web`: web search (Tavily), page reading and site maps (Firecrawl)
 * and image search (Serper), with Kortix's keys. Each call is billed to the
 * workspace's account on the same path as the router proxy the built-in
 * tools use (`router/services/billed-proxy.ts`): the same prices, the same
 * refund when the provider fails, the same fallback when it refuses Kortix's
 * key. As a connector every call also passes the gateway's rules and call log.
 *
 * The account holds no state: its minted credential only names the workspace.
 */
import { HTTPException } from 'hono/http-exception';
import { getProxyServices } from '../../router/config/proxy-services';
import { callKortixProxy } from '../../router/services/billed-proxy';
import { accountKeyOfWorkspace } from '../../workspaces/rows';
import { type AgentTool, i, optInt, optStr, READ, reqStr, s, schema, ToolInputError } from './tool';

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

export const WEB_TOOLS: readonly AgentTool[] = [
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
