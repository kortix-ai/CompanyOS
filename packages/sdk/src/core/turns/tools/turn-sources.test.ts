import { describe, expect, it } from 'bun:test';

import type { ToolPart } from '../../runtime/client';
import { toolCallBlock } from '../../session-log/tool-call';
import type { ToolCallBlock } from '../../session-log/types';
import * as root from '../../../index';
import { deriveTurnSources } from './turn-sources';

let n = 0;
function call(
  tool: string,
  input: Record<string, unknown>,
  output = '',
  status: 'completed' | 'error' = 'completed',
): ToolCallBlock {
  n += 1;
  return toolCallBlock({
    type: 'tool',
    tool,
    callID: `c-${n}`,
    state: { status, input, output },
  } as unknown as ToolPart);
}

const search = (results: Array<Record<string, unknown>>) =>
  call('web_search', { query: 'edge ai' }, JSON.stringify({ query: 'edge ai', results }));

describe('deriveTurnSources', () => {
  it('is exported from the package root', () => {
    expect(root.deriveTurnSources).toBe(deriveTurnSources);
  });

  it('lists every search result with its domain, title and excerpt, in order', () => {
    const sources = deriveTurnSources([
      search([
        { title: 'Edge AI survey', url: 'https://www.arxiv.org/abs/1', content: '  A survey\n of   edge AI. ' },
        { title: 'Digital twins', url: 'https://ieeexplore.ieee.org/doc/2' },
      ]),
    ]);
    expect(sources).toEqual([
      { url: 'https://www.arxiv.org/abs/1', title: 'Edge AI survey', domain: 'arxiv.org', snippet: 'A survey of edge AI.' },
      { url: 'https://ieeexplore.ieee.org/doc/2', title: 'Digital twins', domain: 'ieeexplore.ieee.org', snippet: undefined },
    ]);
  });

  it('a page a search found and a fetch opened is one source that keeps the excerpt', () => {
    const sources = deriveTurnSources([
      call('web_fetch', { url: 'http://example.com/post/' }),
      search([{ title: 'The post', url: 'https://example.com/post', content: 'Excerpt.' }]),
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ domain: 'example.com', snippet: 'Excerpt.' });
  });

  it('names a scraped page by the title the scrape returned, and each URL of a batch is one source', () => {
    const output = JSON.stringify({
      results: [
        { url: 'https://a.example/x', title: 'Page A' },
        { url: 'https://b.example/y', title: '' },
      ],
    });
    const sources = deriveTurnSources([call('scrape_webpage', { urls: 'https://a.example/x, https://b.example/y' }, output)]);
    expect(sources.map((s) => [s.title, s.domain])).toEqual([
      ['Page A', 'a.example'],
      ['b.example', 'b.example'],
    ]);
  });

  it('names a fetched HTML page by its <title>', () => {
    const html = '<html><head><title> The Real Title </title></head><body>x</body></html>';
    const sources = deriveTurnSources([call('web_fetch', { url: 'https://site.example/a', format: 'html' }, html)]);
    expect(sources).toEqual([{ url: 'https://site.example/a', title: 'The Real Title', domain: 'site.example', snippet: undefined }]);
  });

  it('adds nothing for a failed call, a bare query, a non-web tool or a non-http URL', () => {
    expect(
      deriveTurnSources([
        call('web_fetch', { url: 'https://failed.example' }, 'Error: 403', 'error'),
        call('web_search', { query: 'nothing parsed' }, 'no results'),
        call('bash', { command: 'curl https://example.com' }),
        search([{ title: 'Script', url: 'javascript:alert(1)' }]),
      ]),
    ).toEqual([]);
  });
});
