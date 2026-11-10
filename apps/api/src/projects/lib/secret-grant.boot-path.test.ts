// The repair-mode fail-close, on the BOOT path.
//
// `secret-grant.fail-closed.test.ts` pins the resolver: an unparseable
// kortix.yaml grants no project secret (KRTX-4652). The resolver is not what
// delivers secrets at boot, though — a My Kortix session mints its grant from
// `myKortixSessionGrant` and builds its env from that same grant
// (`session-sandbox.ts` mint, `session-sandbox-env-build.ts` secrets leg), and
// neither consulted the manifest. So a repair-mode My Kortix session still
// BOOTED holding every project secret its person can use, and only the
// per-prompt re-mint narrowed it — by which time the values were already in
// the box, which secret-grant.ts's own header calls irreversible.
//
// These tests drive the real manifest loader (`readManifestFromRepo` mocked the
// same way the resolver's suite mocks it) and the real colleague list (no row
// for the session, so nothing is added).
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const actualGit = await import('../git');

let readManifestFromRepoImpl: () => Promise<{ path: string; content: string } | null> = async () =>
  null;

mock.module('../git', () => ({
  ...actualGit,
  readManifestFromRepo: () => readManifestFromRepoImpl(),
}));

// `readColleagueAccess` is the ONLY DB read on this path, and no colleague
// grant exists for the session here: answer the empty row without a database.
const selectingFrom = () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
mock.module('../../shared/db', () => ({ db: { select: selectingFrom } }));

const { resolveSessionSecretGrant } = await import('./secret-grant');
const { myKortixSessionGrant } = await import('./colleague-access');

const PROJECT = {
  projectId: 'p1',
  repoUrl: 'https://github.com/acme/repo',
  defaultBranch: 'main',
  manifestPath: 'kortix.yaml',
};

/** What a My Kortix session boots with: its mint read this grant, and the env
 *  leg took `grant.env` from the same call. */
const SESSION = 'session-1';

beforeEach(() => {
  readManifestFromRepoImpl = async () => null;
});

describe('the boot path fails closed in repair mode, exactly as the resolver does', () => {
  test('repair mode: a My Kortix session mints and boots with NO project secret', async () => {
    readManifestFromRepoImpl = async () => ({
      path: 'kortix.yaml',
      content: 'agents:\n  - [unbalanced\n',
    });
    const session = {
      ...PROJECT,
      sessionAgent: 'mykortix',
      sessionId: SESSION,
    };
    // Before the fix these were both 'all': the boot env held every project
    // secret and the token authorised every one of them.
    expect((await myKortixSessionGrant(SESSION, session)).env).toEqual([]);
    await expect(resolveSessionSecretGrant(session)).resolves.toEqual([]);
  });

  test('repair mode narrows SECRETS only: permissions and connectors stay person-capped', async () => {
    readManifestFromRepoImpl = async () => ({
      path: 'kortix.yaml',
      content: 'agents:\n  - [unbalanced\n',
    });
    const grant = await myKortixSessionGrant(SESSION, PROJECT);
    // The file still has to be repairable, and the repair runs through the
    // project's own tooling and connectors.
    expect(grant.permissions).toBe('all');
    expect(grant.connectors).toBe('all');
    expect(grant.env).toEqual([]);
  });

  test('a readable manifest leaves the My Kortix mint byte-identical', async () => {
    readManifestFromRepoImpl = async () => ({
      path: 'kortix.yaml',
      content: 'builtin_agents:\n  my_kortix: true\nagents:\n  kortix:\n    secrets: all\n',
    });
    const grant = await myKortixSessionGrant(SESSION, PROJECT);
    expect(grant).toEqual({ agent: 'mykortix', permissions: 'all', connectors: 'all', env: 'all' });
    await expect(
      resolveSessionSecretGrant({ ...PROJECT, sessionAgent: 'mykortix', sessionId: SESSION }),
    ).resolves.toBe('all');
  });

  test('a manifest that cannot be READ is not repair mode: My Kortix still boots unrestricted', async () => {
    // Repair mode is specifically a file that was read and is not YAML. An
    // unreadable one is a transient git failure: `loadProjectAgents` swallows
    // it (the resolver is the path that rethrows), and My Kortix's grant is
    // platform-owned, so it keeps what its person holds.
    readManifestFromRepoImpl = async () => {
      throw new Error('git-proxy 429');
    };
    const grant = await myKortixSessionGrant(SESSION, PROJECT);
    expect(grant).toEqual({ agent: 'mykortix', permissions: 'all', connectors: 'all', env: 'all' });
  });

  test('no project git context at all: unchanged, unrestricted', async () => {
    const grant = await myKortixSessionGrant(SESSION, {
      projectId: 'p1',
      repoUrl: 'https://github.com/acme/repo',
      defaultBranch: '',
      manifestPath: 'kortix.yaml',
    });
    expect(grant).toEqual({ agent: 'mykortix', permissions: 'all', connectors: 'all', env: 'all' });
  });
});
