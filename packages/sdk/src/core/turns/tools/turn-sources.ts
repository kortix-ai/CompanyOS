/**
 * The web pages one turn consulted: what a host shows as the turn's sources
 * (the web "N sources" button, the mobile sources row). Pure data → data.
 */
import type { ToolCallBlock } from '../../session-log/types';
import { readableHtmlTitle } from '../html-scan';
import { safeHttpUrl } from '../safe-url';
import { toolKind } from '../tool-kind';
import { looksLikeHtml, parseWebSearchOutput, wsDomain } from './web-helpers';

/** One web page a turn consulted, as the turn's Sources list shows it. */
export interface TurnSource {
  url: string;
  title: string;
  /** The host without `www.`: the line above the title. */
  domain: string;
  /** The search result's excerpt. A fetched page has none. */
  snippet?: string;
}

/**
 * The web pages one turn consulted, in the order the agent met them: every
 * search result and every fetched or scraped page, one row per page. A page
 * that a search surfaced and a later fetch opened is one row, and it keeps
 * the search excerpt. Failed calls and searches with no parseable result add
 * nothing: a bare query is not a source.
 */
export function deriveTurnSources(calls: readonly ToolCallBlock[]): TurnSource[] {
  const byKey = new Map<string, TurnSource>();
  for (const call of calls) {
    if (call.status !== 'complete' || call.result?.is_error) continue;
    const kind = toolKind(call.name);
    if (kind === 'web_search') {
      for (const parsed of parseWebSearchOutput(outputOf(call))) {
        for (const source of parsed.sources) addSource(byKey, source.url, source.title, source.snippet);
      }
    } else if (kind === 'webfetch') {
      const urls = fetchUrlsOf(inputOf(call));
      const titles = scrapeTitlesOf(outputOf(call));
      const pageTitle = urls.length === 1 ? fetchedHtmlTitle(call) : undefined;
      for (const url of urls) addSource(byKey, url, pageTitle || titles.get(url) || '');
    }
  }
  return [...byKey.values()];
}

function addSource(byKey: Map<string, TurnSource>, url: string, title: string, snippet?: string): void {
  const href = safeHttpUrl(url);
  if (!href) return;
  const key = normalizeUrl(href);
  const domain = wsDomain(href).replace(/^www\./i, '');
  const text = snippet?.replace(/\s+/g, ' ').trim() || undefined;
  const seen = byKey.get(key);
  if (seen) {
    seen.snippet ??= text;
    return;
  }
  byKey.set(key, { url: href, title: title.trim() || domain, domain, snippet: text });
}

/** Protocol, `www.` and trailing-slash differences collapse to one key. */
function normalizeUrl(raw: string): string {
  let key = raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').toLowerCase();
  while (key.endsWith('/')) key = key.slice(0, -1);
  return key;
}

function inputOf(call: ToolCallBlock): Record<string, unknown> {
  const input = call.input;
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function outputOf(call: ToolCallBlock): string {
  let text = '';
  for (const item of call.result?.content ?? []) if (item.type === 'text') text += item.text;
  return text;
}

/** `web_fetch` takes `url`; `scrape_webpage` takes `urls`, comma-separated (an array is accepted too). */
function fetchUrlsOf(input: Record<string, unknown>): string[] {
  const raw: unknown[] = [];
  if (typeof input.url === 'string') raw.push(input.url);
  if (typeof input.urls === 'string') raw.push(...input.urls.split(','));
  else if (Array.isArray(input.urls)) raw.push(...input.urls);
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const url = value.trim();
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

/** Page titles from `scrape_webpage` JSON output (one result, or `{ results }`), keyed by URL. */
function scrapeTitlesOf(output: string): Map<string, string> {
  const titles = new Map<string, string>();
  if (!output.trimStart().startsWith('{')) return titles;
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return titles;
  }
  if (!parsed || typeof parsed !== 'object') return titles;
  const record = parsed as Record<string, unknown>;
  const results = Array.isArray(record.results) ? record.results : [record];
  for (const result of results) {
    if (!result || typeof result !== 'object') continue;
    const { url, title } = result as Record<string, unknown>;
    if (typeof url === 'string' && typeof title === 'string' && title.trim()) titles.set(url.trim(), title.trim());
  }
  return titles;
}

/** The `<title>` of a fetch that returned HTML, as the page shows it: entities decoded, whitespace collapsed. */
function fetchedHtmlTitle(call: ToolCallBlock): string | undefined {
  const output = outputOf(call);
  const format = inputOf(call).format;
  const isHtml = format === 'html' || (!format && looksLikeHtml(output));
  if (!isHtml || !output) return undefined;
  return readableHtmlTitle(output) || undefined;
}
