import { afterAll, beforeEach, expect, test } from 'bun:test';
import { kortixAgentMcpUrl } from './host';
import { dispatchKortixAgentMcp } from './server';
import { encodeAccountState } from './state';
import { ToolInputError } from './tool';
import { setWebCallForTests, type WebCall } from './toolbox';

const PROJECT = '4f2a9c1e-1111-4222-8333-944445555666';
const TOKEN = encodeAccountState({ projectId: PROJECT, connectorId: '0f0e0d0c-0000-4000-8000-000000000001', connectionId: '0f0e0d0c-0000-4000-8000-000000000005', service: 'toolbox', data: {} });

let sent: Array<Parameters<WebCall>[0]>;
let answer: (input: Parameters<WebCall>[0]) => unknown;

beforeEach(() => {
  sent = [];
  answer = () => ({});
  setWebCallForTests(async (input) => {
    sent.push(input);
    return answer(input);
  });
});
afterAll(() => setWebCallForTests(null));

async function call(name: string, args: Record<string, unknown>) {
  const res = await dispatchKortixAgentMcp(new Request(kortixAgentMcpUrl('toolbox'), {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  return ((await res.json()) as { result: { structuredContent?: any; isError?: boolean; content: Array<{ text: string }> } }).result;
}

test('search sends the Tavily request the built-in tool sends, billed to the workspace', async () => {
  answer = () => ({ answer: 'A cable tray.', results: [{ title: 'T', url: 'https://example.test/a', content: 'snip', score: 0.9 }], images: ['https://example.test/i.png'] });
  const r = await call('search', { query: 'desk cable tray', num_results: 50, topic: 'news', time_range: 'week' });
  expect(sent).toEqual([{
    projectId: PROJECT,
    service: 'tavily',
    path: '/search',
    body: { query: 'desk cable tray', search_depth: 'basic', topic: 'news', max_results: 20, include_answer: true, include_images: true, include_image_descriptions: true, time_range: 'week' },
  }]);
  expect(r.structuredContent).toEqual({
    query: 'desk cable tray',
    answer: 'A cable tray.',
    results: [{ title: 'T', url: 'https://example.test/a', snippet: 'snip', score: 0.9, published_date: '' }],
    images: [{ url: 'https://example.test/i.png', description: '' }],
  });
  expect((await call('search', { query: 'x', topic: 'sports' })).isError).toBe(true);
});

test('scrape reads several pages; one failure does not sink the others', async () => {
  answer = ({ body }) => {
    if (body.url === 'https://example.test/bad') throw new ToolInputError('firecrawl answered 403: blocked');
    return { success: true, data: { markdown: '# Hi', metadata: { title: 'Hi' } } };
  };
  const r = await call('scrape', { urls: ['https://example.test/ok', 'https://example.test/bad'] });
  expect(sent.map((s) => [s.service, s.path, s.body.url])).toEqual([
    ['firecrawl', '/v2/scrape', 'https://example.test/ok'],
    ['firecrawl', '/v2/scrape', 'https://example.test/bad'],
  ]);
  expect(r.structuredContent.pages).toEqual([
    { url: 'https://example.test/ok', success: true, title: 'Hi', content: '# Hi', content_length: 4, metadata: { title: 'Hi' } },
    { url: 'https://example.test/bad', success: false, error: 'firecrawl answered 403: blocked' },
  ]);
  expect((await call('scrape', { url: 'ftp://example.test' })).isError).toBe(true);
  expect((await call('scrape', { urls: Array.from({ length: 11 }, (_, n) => `https://example.test/${n}`) })).isError).toBe(true);
});

test('map and image_search', async () => {
  answer = ({ service }) =>
    service === 'firecrawl'
      ? { links: ['https://docs.example.test/a', { url: 'https://docs.example.test/b', title: 'B' }] }
      : { images: [{ imageUrl: 'https://example.test/i.jpg', title: 'I', link: 'https://example.test', imageWidth: 10, imageHeight: 20 }] };
  const map = await call('map', { url: 'https://docs.example.test', search: 'pricing' });
  expect(sent[0]).toMatchObject({ service: 'firecrawl', path: '/v2/map', body: { url: 'https://docs.example.test', limit: 100, search: 'pricing' } });
  expect(map.structuredContent).toEqual({ site: 'https://docs.example.test', total: 2, links: [{ url: 'https://docs.example.test/a', title: '' }, { url: 'https://docs.example.test/b', title: 'B' }] });
  const images = await call('image_search', { query: 'desk' });
  expect(sent[1]).toMatchObject({ service: 'serper', path: '/images', body: { q: 'desk', num: 12 } });
  expect(images.structuredContent).toEqual({ query: 'desk', total: 1, images: [{ url: 'https://example.test/i.jpg', title: 'I', source: 'https://example.test', width: 10, height: 20 }] });
});

test('a refused call (no credits) is a tool error the agent reads', async () => {
  answer = () => {
    throw new ToolInputError('not enough credits: Insufficient credits');
  };
  const r = await call('search', { query: 'x' });
  expect(r.isError).toBe(true);
  expect(r.content[0]!.text).toContain('not enough credits');
});
