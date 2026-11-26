import { expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { configureKortix } from '../core/http/config';
import { prefetchWorkspaceShell, sandboxHealthQueryOptions } from './prefetch-workspace-shell';
import { qk } from './query-keys';

test('seeds the exact entries the shell hooks read, one request each', async () => {
  const urls: string[] = [];
  configureKortix({
    backendUrl: 'http://api.test/v1',
    getToken: async () => 'synthetic-token',
    fetch: async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      if (url.includes('/detail')) {
        return Response.json({ project: { id: 'W1', account_id: 'A1' }, config: {}, file_count: 0, files: [], git_connection: null });
      }
      if (url.includes('/sandbox-health')) return Response.json({ sandboxes: [] });
      if (url.includes('/model-picker')) return Response.json({ models: [] });
      return Response.json([]);
    },
  });
  const client = new QueryClient();
  prefetchWorkspaceShell(client, 'W1');
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(sandboxHealthQueryOptions('W1').queryKey).toEqual(['sandbox-health', 'W1']);
  for (const key of [
    qk.project.detail('W1'),
    qk.project.modelPicker('W1'),
    qk.project.sessionsPaged('W1', 'visible'),
    sandboxHealthQueryOptions('W1').queryKey,
  ]) {
    expect(client.getQueryData(key)).toBeDefined();
  }
  expect(urls.filter((url) => url.includes('/workspaces/W1/'))).toHaveLength(4);
  client.clear();
});
