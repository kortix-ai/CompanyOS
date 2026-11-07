import { expect, test } from 'bun:test';
import { computeTemplateIdentity, type ResolvedTemplate } from './templates';

/**
 * Tenant scope of a project template's snapshot identity (KRTX-4469, strix
 * finding b4383e8e: CWE-639, HIGH).
 *
 * ComputeTemplateIdentity used to hash only the template CONTENT into its
 * snapshot name. Snapshot names are content-addressed inside ONE provider
 * namespace (the platform's single account), so two projects in different
 * accounts that declared a template with the same slug, image/dockerfile, spec
 * and region derived the same `kortix-tpl-<hash>` name. A project-scoped
 * `POST /v1/projects/:id/snapshots/rebuild` for that name reached the OTHER
 * tenant's image: DELETE removed it under every enabled provider and the
 * re-bake could carry the caller's (baked but unhashed) entrypoint, which the
 * other tenant's next session — its row still matched on
 * contentHash/snapshotName — then booted.
 */

const projectA = { projectId: 'proj_a', repoUrl: '', defaultBranch: 'main', manifestPath: 'kortix.yaml' };
const projectB = { projectId: 'proj_b', repoUrl: '', defaultBranch: 'main', manifestPath: 'kortix.yaml' };

function template(overrides: Partial<ResolvedTemplate> = {}): ResolvedTemplate {
  return {
    templateId: 'tmpl_1',
    projectId: 'proj_a',
    slug: 'app',
    name: 'app',
    isShared: false,
    source: 'toml',
    provider: 'platinum',
    image: 'ubuntu:24.04',
    dockerfilePath: null,
    entrypoint: null,
    cpu: 2,
    memoryGb: 4,
    diskGb: 20,
    containerRuntime: false,
    residentialProxy: null,
    providerState: 'active',
    providerSnapshotName: null,
    contentHash: null,
    builtFromCommit: null,
    swapKey: null,
    lastReady: {},
    ...overrides,
  };
}

const builtIn = (region: string | undefined) => ({ imageRegion: async () => region });

test('two projects with identical template content derive DIFFERENT snapshot names', async () => {
  const a = await computeTemplateIdentity(projectA, template({ projectId: 'proj_a' }), builtIn(undefined));
  const b = await computeTemplateIdentity(
    projectB,
    template({ projectId: 'proj_b', templateId: 'tmpl_2' }),
    builtIn(undefined),
  );
  expect(a.snapshotName).toStartWith('kortix-tpl-');
  expect(b.snapshotName).toStartWith('kortix-tpl-');
  expect(b.snapshotName).not.toBe(a.snapshotName);
  // The agent-swap eligibility key moves too, so a swap can never patch a
  // predecessor image another tenant holds the key for.
  expect(b.swapKey).not.toBe(a.swapKey);
});

test('an entrypoint change re-bakes under a new identity, not over live image content', async () => {
  const before = await computeTemplateIdentity(
    projectA,
    template({ entrypoint: null }),
    builtIn(undefined),
  );
  const after = await computeTemplateIdentity(
    projectA,
    template({ entrypoint: '/usr/bin/greet' }),
    builtIn(undefined),
  );
  expect(after.snapshotName).not.toBe(before.snapshotName);
  // An entrypoint is not agent-drift: the swap gate must fall back to a full
  // rebuild when it changes.
  expect(after.swapKey).not.toBe(before.swapKey);
});

test('the shared platform default keeps its project-independent identity', async () => {
  const a = await computeTemplateIdentity(
    projectA,
    template({ projectId: 'proj_a', isShared: true, slug: 'default', image: null }),
    builtIn(undefined),
  );
  const b = await computeTemplateIdentity(
    projectB,
    template({ projectId: 'proj_b', templateId: 'tmpl_2', isShared: true, slug: 'default', image: null }),
    builtIn(undefined),
  );
  expect(b.snapshotName).toBe(a.snapshotName);
  expect(b.swapKey).toBe(a.swapKey);
});

test('an identity is refused when the template row belongs to a different project', async () => {
  const crossTenant = computeTemplateIdentity(projectA, template({ projectId: 'proj_b' }), builtIn(undefined));
  await expect(crossTenant).rejects.toThrow(/belongs to a different project/);
});
