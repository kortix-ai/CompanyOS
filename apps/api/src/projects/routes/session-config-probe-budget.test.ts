/**
 * The GET /config freshness read must never let a hung box hold the poller.
 *
 * KRTX-629: `readSandboxConfigState` awaited `/kortix/health` under a hard
 * 10 s `AbortSignal` and offered callers no shorter budget. A box that did
 * not answer made every freshness poll pay the full 10 s; one workspace
 * session whose daemon stopped answering health produced 18 such reads in
 * two hours and set the route's p95 at ~10000 ms while its p50 stayed flat.
 * The read edge may bound its own probe; reloads and convergences keep the
 * full budget because they act on the answer.
 *
 * Behavior lives on `readSandboxConfigState` (lib); the wiring is a
 * chokepoint over the route source: the freshness read must pass its 3 s
 * probe budget, and the function's default must stay 10 s for the callers
 * that act on the answer.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readSandboxConfigState, type SessionReloadDeps } from '../lib/session-reload';

const SESSION_ID = '00000000-0000-4000-8000-000000000001';

const routeSource = readFileSync(join(dirname(import.meta.path), 'session-config.ts'), 'utf8');
const reloadSource = readFileSync(join(dirname(import.meta.path), '..', 'lib', 'session-reload.ts'), 'utf8');

function depsWith(fetchImpl: SessionReloadDeps['fetch']): SessionReloadDeps {
  return {
    endpoint: async () => ({ baseUrl: 'http://box', headers: {} }),
    fetch: fetchImpl,
    pushGovernance: async () => ({ applied: true }),
    latestEtag: async () => 'ffff',
    sleep: async () => {},
    recordReport: async () => {},
    repairOrphanedTurn: async () => {},
  };
}

describe('readSandboxConfigState', () => {
  test('aborts at the caller budget, not the 10 s default, and degrades to unreachable', async () => {
    // The daemon never answers; the abort is the only exit.
    const deps = depsWith(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject((init.signal as AbortSignal).reason ?? new Error('aborted'));
          });
        }),
    );
    const startedAt = Date.now();
    const state = await readSandboxConfigState({ sessionId: SESSION_ID, timeoutMs: 1 }, deps);
    expect(state.reachable).toBe(false);
    expect(state.etag).toBeNull();
    expect(state.commitSha).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  test('a healthy daemon parses without a caller budget (default stays on)', async () => {
    const deps = depsWith(async () =>
      Response.json({
        agent_config_etag: 'etag-1',
        commit_sha: 'c'.repeat(40),
        config_dir_sha: 'd'.repeat(40),
        turn_in_flight: false,
        capabilities: ['config.release.v1'],
      }),
    );
    const state = await readSandboxConfigState({ sessionId: SESSION_ID }, deps);
    expect(state.reachable).toBe(true);
    expect(state.etag).toEqual('etag-1');
    expect(state.commitSha).toEqual('c'.repeat(40));
    expect(state.configDirSha).toEqual('d'.repeat(40));
    expect(state.turnInFlight).toBe(false);
    expect(state.configReleases).toBe(true);
  });

  test('a failed probe still answers unreachable (no throw reaches the read path)', async () => {
    const deps = depsWith(async () => new Response('bad gateway', { status: 502 }));
    const state = await readSandboxConfigState({ sessionId: SESSION_ID }, deps);
    expect(state.reachable).toBe(false);
  });

  test('a hung endpoint resolution cannot outwait the probe budget', async () => {
    // The endpoint step resolves the sandbox ingress through a provider API
    // call before any fetch exists to abort. The budget must cap the WHOLE
    // probe, or a degraded provider holds the poller past the fetch's own
    // abort (KRTX-629 follow-up: 9.7-11.8 s `sandbox_state` stages).
    const deps: SessionReloadDeps = {
      ...depsWith(async () => Response.json({ agent_config_etag: 'etag-1' })),
      endpoint: () => new Promise(() => {}),
    };
    const startedAt = Date.now();
    const state = await readSandboxConfigState({ sessionId: SESSION_ID, timeoutMs: 50 }, deps);
    expect(state.reachable).toBe(false);
    expect(state.etag).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});

describe('GET /config box-health probe budget', () => {
  test('the freshness read passes the 3 s probe budget', () => {
    expect(routeSource).toContain('const SANDBOX_CONFIG_PROBE_TIMEOUT_MS = 3_000');
    expect(routeSource).toContain('readSandboxConfigState({ sessionId, timeoutMs: SANDBOX_CONFIG_PROBE_TIMEOUT_MS })');
  });

  test('the shared default stays 10 s for reloads and convergences', () => {
    expect(reloadSource).toContain('AbortSignal.timeout(input.timeoutMs ?? 10_000)');
  });
});

describe('GET /config mirror budget', () => {
  test('the poll spends a poll-sized budget, not the 20 s reload budget', () => {
    expect(routeSource).toContain('const SANDBOX_CONFIG_MIRROR_BUDGET_MS = 5_000');
    expect(routeSource).toContain(
      'Math.max(1_000, SANDBOX_CONFIG_MIRROR_BUDGET_MS - (Date.now() - spendFrom))',
    );
  });

  test('reloads and convergences keep the full 20 s budget', () => {
    expect(reloadSource).toContain('export const LATEST_ETAG_BUDGET_MS = 20_000');
  });
});
