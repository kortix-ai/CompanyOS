import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../packages/manifest-schema/src/index';
import { RUN7_YAML } from '../src/fixtures/run7-manifest';

/**
 * RUN-7's no-checkout contract (release gate, 2026-11-10): the gate's
 * `commit-push` needs `/workspace` materialized, and #12136/#12262 moved the
 * checkout behind an agent-level `workspace: { repos }` declaration — the
 * starter keeps no `workspace:` key, so the flow's own manifest carries it.
 * This pins the flow's shape (source-read, like the CON-5 pattern) and
 * validates its manifest through the real v3 validator.
 */
const source = readFileSync(
  resolve(import.meta.dirname, '../src/flows/run-session-backlog.flow.ts'),
  'utf8',
);
const run7Start = source.indexOf("harnessFlow(\n  'RUN-7'");
const run7Body = source.slice(run7Start, source.indexOf('\n// ─── RUN-8', run7Start));

describe('RUN-7 materializes /workspace through the agent workspace declaration', () => {
  it('the flow seeds its own project and commits the manifest before booting', () => {
    const bootAt = run7Body.indexOf('bootSession');
    const manifestCommit = run7Body.indexOf("{ 'kortix.yaml': RUN7_YAML }");
    const ownProject = run7Body.indexOf('ctx.fixtures.project({ seed: true })');
    expect(manifestCommit).toBeGreaterThan(-1);
    expect(ownProject).toBeGreaterThan(-1);
    expect(manifestCommit).toBeLessThan(bootAt);
  });

  it('the manifest carries one workspace clone of the project on /workspace and nothing else', () => {
    expect(RUN7_YAML).toContain('    workspace:\n      repos:\n        - path: /workspace\n');
    expect(RUN7_YAML.match(/^\s*workspace:/gm)?.length).toBe(1);
    expect(RUN7_YAML).not.toMatch(/project_repository|repository_access/);
  });

  it('the wait for the clone sits between the write turn and the commit-push step', () => {
    const wait = run7Body.indexOf("'the /workspace clone to land");
    const writeStep = run7Body.indexOf('waitForTurn(ctx, projectId, sessionId, endedAfter(before)');
    const commitStep = run7Body.indexOf("'POST .../commit-push → 200 pushed'");
    expect(writeStep).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(writeStep);
    expect(commitStep).toBeGreaterThan(wait);
  });

  it('its world is closed in a finally', () => {
    expect(run7Body.slice(-400)).toContain('finally');
    expect(run7Body.slice(-400)).toContain('await world.close()');
  });

  it('the manifest validates through the product manifest schema', () => {
    const result = validateManifest(RUN7_YAML);
    expect(result.issues).toEqual([]);
  });

  it('the booted agent is the manifest worker, not another seeded default', () => {
    expect(run7Body).toContain("agentName: 'worker'");
    expect(RUN7_YAML).toContain('default_agent: worker');
    expect(RUN7_YAML).not.toContain('project_repository');
  });
});
