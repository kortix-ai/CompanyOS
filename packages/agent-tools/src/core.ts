/**
 * The agent tool core. One surface, three adapters (MCP, pi in sessions, the
 * CLI): `skills`, `search`, `describe` and `call` here; `execute` and `resume`
 * need a runtime and live in the API adapter.
 *
 * The core never decides access. Each source lists only what its caller may
 * reach and runs each call with the caller's authority.
 */
import { buildIndex, type RankIndex } from './rank';
import type { JsonSchema, SkillSource, SkillSummary, ToolCallOutcome, ToolEntry, ToolSource } from './types';

/** A search page stays under this many bytes of JSON, so one search never floods a context. */
export const SEARCH_PAGE_BYTES = 8 * 1024;
export const SEARCH_DEFAULT_LIMIT = 10;
export const SEARCH_MAX_LIMIT = 50;
const DESCRIPTION_CHARS = 240;

/** One search result: enough to choose and call, never a full schema. */
export interface SearchHit {
  id: string;
  title: string;
  risk: string | null;
  description: string;
  /** Compact input: `channel: string, text: string, thread_ts?: string`. */
  input: string;
}

export interface SearchPage {
  results: SearchHit[];
  /** True when the byte budget or the limit cut the page. */
  truncated: boolean;
  /** The next step, in one sentence, for the agent. */
  next: string;
}

export interface DescribeResult {
  id: string;
  title: string;
  description: string;
  risk: string | null;
  input_schema: JsonSchema | null;
  output_schema: JsonSchema | null;
}

export interface ToolCore {
  skills(name?: string): Promise<{ skills: SkillSummary[] } | { name: string; content: string } | null>;
  search(input: { query: string; limit?: number; family?: string }): Promise<SearchPage>;
  describe(id: string): Promise<DescribeResult | { error: string; suggestions: string[] }>;
  call(id: string, input: Record<string, unknown>): Promise<ToolCallOutcome>;
  /** The ids closest to `id`, for an unknown-id answer. */
  suggest(id: string, limit?: number): Promise<string[]>;
}

export function createToolCore(options: { sources: ToolSource[]; skills?: SkillSource | null }): ToolCore {
  const sources = [...options.sources].sort((a, b) => b.prefix.length - a.prefix.length);
  let index: Promise<RankIndex> | null = null;
  const loadIndex = () => {
    if (!index) {
      index = Promise.all(sources.map((s) => s.list().catch(() => [] as ToolEntry[]))).then((lists) =>
        buildIndex(lists.flat()),
      );
    }
    return index;
  };
  const sourceOf = (id: string) => sources.find((s) => id.startsWith(s.prefix)) ?? null;

  // Typos first (edit distance within the id's family), then words (BM25).
  const suggest = async (id: string, limit = 3) => {
    const idx = await loadIndex();
    const family = id.includes('.') ? id.slice(0, id.indexOf('.') + 1) : '';
    const near = idx.entries
      .filter((e) => family && e.id.startsWith(family))
      .map((e) => ({ id: e.id, d: editDistance(id, e.id) }))
      .filter((x) => x.d <= Math.max(2, Math.floor(id.length / 5)))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.id);
    const words = idx.search(id.replace(/[._]/g, ' '), limit).map((h) => h.entry.id);
    return [...new Set([...near, ...words])].slice(0, limit);
  };

  return {
    async skills(name) {
      if (!options.skills) return { skills: [] };
      if (!name) return { skills: await options.skills.list() };
      return options.skills.read(name);
    },

    async search({ query, limit, family }) {
      const max = Math.min(Math.max(1, Math.floor(limit ?? SEARCH_DEFAULT_LIMIT)), SEARCH_MAX_LIMIT);
      const idx = await loadIndex();
      const prefix = family ? (family.endsWith('.') ? family : `${family}.`) : null;
      const hits = idx
        .search(query, prefix ? max * 4 : max + 1)
        .filter((h) => !prefix || h.entry.id.startsWith(prefix));
      const results: SearchHit[] = [];
      let bytes = 2;
      let truncated = hits.length > max;
      for (const { entry } of hits.slice(0, max)) {
        const hit = toHit(entry);
        const size = JSON.stringify(hit).length + 1;
        if (bytes + size > SEARCH_PAGE_BYTES) {
          truncated = true;
          break;
        }
        bytes += size;
        results.push(hit);
      }
      return {
        results,
        truncated,
        next:
          results.length === 0
            ? 'No tool matched. Try other words, or `skills` to read how this part of Kortix works.'
            : '`describe` an id for its full input schema, then `call` it with { id, input }.',
      };
    },

    async describe(id) {
      const source = sourceOf(id);
      const entry = source
        ? ((await source.describe?.(id)) ?? (await loadIndex()).entries.find((e) => e.id === id) ?? null)
        : null;
      if (!entry) return { error: `No tool has the id "${id}".`, suggestions: await suggest(id) };
      return {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        risk: entry.risk,
        input_schema: entry.inputSchema ?? null,
        output_schema: entry.outputSchema ?? null,
      };
    },

    async call(id, input) {
      const source = sourceOf(id);
      const known = source
        ? (await loadIndex()).entries.some((e) => e.id === id) || (await source.describe?.(id)) != null
        : false;
      if (!source || !known) {
        const suggestions = await suggest(id);
        return {
          status: 'error',
          reason: 'unknown_tool',
          message: `No tool has the id "${id}".${suggestions.length ? ` Closest: ${suggestions.join(', ')}.` : ''} Use \`search\` to find one.`,
        };
      }
      return source.call(id, input ?? {});
    },

    suggest,
  };
}

function toHit(entry: ToolEntry): SearchHit {
  const description =
    entry.description.length > DESCRIPTION_CHARS ? `${entry.description.slice(0, DESCRIPTION_CHARS - 1)}…` : entry.description;
  return { id: entry.id, title: entry.title, risk: entry.risk, description, input: compactSignature(entry.inputSchema) };
}

/** `a: string, b?: number` from a JSON Schema object, at most 8 fields. */
export function compactSignature(schema: JsonSchema | null | undefined): string {
  const props = schema && typeof schema.properties === 'object' && schema.properties ? (schema.properties as Record<string, JsonSchema>) : null;
  if (!props) return '';
  const required = new Set(Array.isArray(schema?.required) ? (schema!.required as string[]) : []);
  const names = Object.keys(props);
  const parts = names.slice(0, 8).map((name) => `${name}${required.has(name) ? '' : '?'}: ${typeName(props[name])}`);
  if (names.length > 8) parts.push(`…+${names.length - 8}`);
  return parts.join(', ');
}

function typeName(schema: JsonSchema | undefined): string {
  if (!schema) return 'unknown';
  if (Array.isArray(schema.enum)) return schema.enum.slice(0, 4).map((v) => JSON.stringify(v)).join('|');
  const t = schema.type;
  if (Array.isArray(t)) return t.join('|');
  if (t === 'array') return `${typeName(schema.items as JsonSchema | undefined)}[]`;
  return typeof t === 'string' ? t : 'object';
}

/** Levenshtein distance, two rows. Ids are short. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}
