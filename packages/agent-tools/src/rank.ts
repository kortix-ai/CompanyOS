/**
 * BM25 ranking over tool entries. One ranker for every family: connector
 * actions, Kortix API operations and built-ins rank against each other.
 *
 * Fields are weighted by repetition (id ×3, title and keywords ×2,
 * description ×1): a word in a tool's name outranks the same word buried in
 * its description.
 */
import type { ToolEntry } from './types';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'on', 'or',
  'that', 'the', 'this', 'to', 'with', 'v1', 'my', 'me', 'i', 'get', 'can', 'how', 'do', 'what',
]);

/** Lowercase word stems: splits camelCase, snake_case, dots, slashes and path params. */
export function tokenize(text: string): string[] {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  const out: string[] = [];
  for (const word of words) {
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

/** A light English stem: enough that "messages" finds "message" and "sending" finds "send". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('es') && /(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function docTokens(entry: ToolEntry): string[] {
  const id = tokenize(entry.id);
  const title = tokenize(entry.title);
  const keywords = tokenize((entry.keywords ?? []).join(' '));
  return [...id, ...id, ...id, ...title, ...title, ...keywords, ...keywords, ...tokenize(entry.description)];
}

export interface RankIndex {
  entries: ToolEntry[];
  search(query: string, limit: number): Array<{ entry: ToolEntry; score: number }>;
}

/** Builds the index once; `search` is O(query terms × matching docs). */
export function buildIndex(entries: ToolEntry[], k1 = 1.2, b = 0.75): RankIndex {
  const postings = new Map<string, Array<{ doc: number; tf: number }>>();
  const lengths: number[] = [];
  entries.forEach((entry, doc) => {
    const tokens = docTokens(entry);
    lengths.push(tokens.length);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, count] of tf) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      list.push({ doc, tf: count });
    }
  });
  const n = entries.length;
  const avg = n === 0 ? 0 : lengths.reduce((a, c) => a + c, 0) / n;

  return {
    entries,
    search(query, limit) {
      const terms = [...new Set(tokenize(query))];
      if (terms.length === 0 || n === 0) return [];
      const scores = new Map<number, number>();
      for (const term of terms) {
        const list = postings.get(term);
        if (!list) continue;
        const idf = Math.log(1 + (n - list.length + 0.5) / (list.length + 0.5));
        for (const { doc, tf } of list) {
          const norm = tf + k1 * (1 - b + (b * lengths[doc]!) / (avg || 1));
          scores.set(doc, (scores.get(doc) ?? 0) + idf * ((tf * (k1 + 1)) / norm));
        }
      }
      return [...scores.entries()]
        .sort((x, y) => y[1] - x[1] || entries[x[0]]!.id.length - entries[y[0]]!.id.length)
        .slice(0, limit)
        .map(([doc, score]) => ({ entry: entries[doc]!, score }));
    },
  };
}
