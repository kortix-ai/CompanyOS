/**
 * KRTX-4867: `GET /sandbox-health` is a page-view poll like `/snapshots` and
 * `/sandboxes/templates`, but it never opted into stale mirror reads. Its
 * template listing then synced the manifest through a blocking `git fetch`
 * on every cold memo (prod p95 5.6 s against a 22 ms median). Pinned through
 * the real handler: the opt-in must happen before the git project is read.
 */
import { beforeEach, expect, mock, test } from 'bun:test';

const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
let calls: string[];

const realAccess = await import('../lib/access');
mock.module('../lib/access', () => ({
  ...realAccess,
  loadProjectForUser: async () => ({ userId: 'u1', row: { accountId: 'a1', metadata: {} } }),
}));
const realMirror = await import('../git/mirror');
mock.module('../git/mirror', () => ({
  ...realMirror,
  allowStaleMirrorReads: () => {
    calls.push('stale-reads');
  },
}));
const realGit = await import('../lib/git');
mock.module('../lib/git', () => ({
  ...realGit,
  loadGitProject: async () => {
    calls.push('git-project');
    throw new Error('stop: no templates needed');
  },
}));
const realBuilder = await import('../../snapshots/builder');
mock.module('../../snapshots/builder', () => ({
  ...realBuilder,
  listSnapshotBuilds: async () => [],
}));
const { projectsApp } = await import('../lib/app');
(await import('./sandboxes')).registerSandboxesRoutes();

beforeEach(() => {
  calls = [];
});

test('sandbox-health serves the warm mirror before it reads the git project', async () => {
  const response = await projectsApp.request(`/${PROJECT_ID}/sandbox-health`);
  expect(response.status).toBe(200);
  expect(calls).toEqual(['stale-reads', 'git-project']);
});
