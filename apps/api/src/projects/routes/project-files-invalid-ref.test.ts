import { expect, mock, test } from 'bun:test';

mock.module('../../middleware/caller-session', () => ({ callerKortixSessionId: () => null }));
const access = await import('../lib/access');
mock.module('../lib/access', () => ({
  ...access,
  loadProjectForUser: async () => ({
    userId: 'owner',
    row: { accountId: 'account', defaultBranch: 'main' },
  }),
  assertProjectCapability: async () => {},
}));
const resources = await import('../lib/project-resources');
mock.module('../lib/project-resources', () => ({
  ...resources,
  resourceDenierForRequest: async () => ({ isDenied: () => false }),
}));
const git = await import('../lib/git');
mock.module('../lib/git', () => ({ ...git, withProjectGitAuth: async () => ({}) }));
const { projectsApp } = await import('../lib/app');
(await import('./project-files')).registerProjectFilesRoutes();

const get = (endpoint: 'raw' | 'content', ref: string) =>
  projectsApp.request(`/project/files/${endpoint}?path=README.md&ref=${encodeURIComponent(ref)}`);

test('a malformed ref is a 400 on files/raw and files/content, never a 500', async () => {
  for (const endpoint of ['raw', 'content'] as const) {
    for (const ref of ['a b', 'a..b', '-x', 'HEAD~1', 'a@{0}']) {
      const response = await get(endpoint, ref);
      expect([endpoint, ref, response.status]).toEqual([endpoint, ref, 400]);
      expect(await response.json()).toEqual({ error: 'Invalid ref' });
    }
  }
});
