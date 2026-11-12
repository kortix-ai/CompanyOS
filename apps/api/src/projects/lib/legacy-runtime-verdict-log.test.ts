import { describe, expect, test } from 'bun:test';

import {
  type ExpectedRunningAssets,
  type LegacyBootstrapDeps,
  LEGACY_BOOTSTRAP_METADATA_KEY,
  REQUIRED_RUNTIME_CAPABILITIES,
  bootstrapLegacyRuntime,
} from './legacy-runtime-bootstrap';

/**
 * Every repair run ends in a verdict. Until 2026-11-11 the verdicts that end
 * BEFORE the script ran shipped no line at all: a spell where the daemon port
 * stopped answering saw `/start` request the dead-daemon relaunch a dozen
 * times in six minutes, not one `[legacy-bootstrap]` line, and the box
 * recovered on its own with nobody able to say why nothing was repaired.
 * These tests pin the one verdict line per run.
 */
const MANIFEST: ExpectedRunningAssets = {
  cli_sha256: 'c'.repeat(64),
  managed_skills_hash: 'm'.repeat(64),
  agent_sha256: 'a'.repeat(64),
};
const CURRENT_HEALTH = {
  daemon: 'ok',
  harness: { id: 'pi', version: null, state: 'ok', ready: true, error: null, session: { id: null, required: false }, turn: null, details: {} },
  capabilities: [...REQUIRED_RUNTIME_CAPABILITIES],
  uptime_s: 600,
  runtime: {
    build: 1788044234,
    components: { agent: 'current', opencode: 'current', cli: 'current', skills: 'current' },
    agentSwapPending: false,
    pinned: false,
    running: {
      cli_sha256: MANIFEST.cli_sha256,
      managed_skills_hash: MANIFEST.managed_skills_hash,
      agent_sha256: MANIFEST.agent_sha256,
    },
  },
};
/** A legacy-era health body: the daemon answers but reports no runtime block. */
const LEGACY_HEALTH = { daemon: 'ok', uptime_s: 600 };

interface Calls {
  execs: string[][];
  patches: Record<string, unknown>[];
}

function verdictDeps(
  over: Partial<LegacyBootstrapDeps> & { health?: unknown[]; turn?: boolean | null },
  calls: Calls,
  lines: Array<{ message: string; context: unknown }>,
): LegacyBootstrapDeps {
  const healths = over.health ?? [LEGACY_HEALTH, CURRENT_HEALTH];
  let i = 0;
  const clock = { t: 1_000_000 };
  return {
    now: () => clock.t,
    sleep: async (ms) => {
      clock.t += ms;
    },
    manifestBuild: async () => 1788044234,
    fetchHealth: async () => healths[Math.min(i++, healths.length - 1)],
    fetchTurnInFlight: async () => (over.turn === undefined ? false : over.turn),
    providerRunning: over.providerRunning ?? (async () => true),
    exec: async (cmd) => {
      if (cmd.join(' ').includes('127.0.0.1:8000/kortix/health')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      calls.execs.push(cmd);
      return { exitCode: 0, stdout: '{"ok":true,"stage":"relaunched","agent_sha256":"a","entrypoint_sha256":"e"}\n', stderr: '' };
    },
    patchMetadata: async (patch) => {
      calls.patches.push(patch);
    },
    claimRun: async (patch) => {
      calls.patches.push(patch);
      return true;
    },
    audit: async () => {},
    log: (message, context) => {
      lines.push({ message, context });
    },
    ...over,
  };
}

const input = (metadata: Record<string, unknown> | null = null) => ({
  sandboxId: 'sb1',
  externalId: 'sbx_1',
  provider: 'platinum',
  metadata,
  reason: 'test' as const,
});

describe('the repair run names its verdict when it never runs the script', () => {
  test('a busy gate ships one line with the outcome and the box', async () => {
    const calls: Calls = { execs: [], patches: [] };
    const lines: Array<{ message: string; context: unknown }> = [];
    const r = await bootstrapLegacyRuntime(input(), verdictDeps({ turn: true }, calls, lines));
    expect(r.outcome).toBe('skipped-busy');
    expect(lines).toHaveLength(1);
    expect(lines[0].message).toBe('skipped: busy');
    expect(lines[0].context).toMatchObject({ sandboxId: 'sb1', externalId: 'sbx_1', reason: 'test' });
  });

  test('an already-staged gate ships its own verdict and touches nothing', async () => {
    const calls: Calls = { execs: [], patches: [] };
    const lines: Array<{ message: string; context: unknown }> = [];
    const stagedRecord = {
      state: 'staged',
      attempts: 1,
      manifestBuild: 1788044234,
      lastAttemptAt: new Date(0).toISOString(),
    };
    const r = await bootstrapLegacyRuntime(
      input({ [LEGACY_BOOTSTRAP_METADATA_KEY]: stagedRecord }),
      verdictDeps({ health: [LEGACY_HEALTH] }, calls, lines),
    );
    expect(r.outcome).toBe('skipped-staged');
    expect(r.detail).toBe('already staged; converges at next start');
    expect(lines).toHaveLength(1);
    expect(lines[0].message).toBe('skipped: staged');
    expect(lines[0].context).toMatchObject({ detail: r.detail });
    // The gate runs before the script: nothing claimed, nothing written, nothing executed.
    expect(calls.execs).toEqual([]);
    expect(calls.patches).toEqual([]);
  });

  test('a provider the control plane cannot ask names that fact', async () => {
    const calls: Calls = { execs: [], patches: [] };
    const lines: Array<{ message: string; context: unknown }> = [];
    const r = await bootstrapLegacyRuntime(
      input(),
      verdictDeps({ health: [null, null], providerRunning: async () => false }, calls, lines),
    );
    expect(r.outcome).toBe('unreachable');
    expect(r.detail).toBe('daemon silent twice; the provider could not confirm the box is running');
    expect(lines).toHaveLength(1);
    expect(lines[0].message).toBe('skipped: unreachable');
    expect(lines[0].context).toMatchObject({ detail: r.detail });
  });

  test('a daemon alive on its own loopback names the ingress miss', async () => {
    const calls: Calls = { execs: [], patches: [] };
    const lines: Array<{ message: string; context: unknown }> = [];
    const r = await bootstrapLegacyRuntime(input(), verdictDeps({ health: [null, null] }, calls, lines));
    expect(r.outcome).toBe('not-legacy');
    expect(r.detail).toBe('daemon alive in the box; the ingress was unreachable');
    expect(lines).toHaveLength(1);
    expect(lines[0].message).toBe('skipped: not-legacy');
  });

  test('a completed repair logs only the terminal line, not a second verdict', async () => {
    const calls: Calls = { execs: [], patches: [] };
    const lines: Array<{ message: string; context: unknown }> = [];
    const r = await bootstrapLegacyRuntime(input(), verdictDeps({}, calls, lines));
    expect(r.outcome).toBe('converged');
    expect(lines.map((l) => l.message).filter((m) => m.startsWith('skipped:'))).toEqual([]);
    // The claim and the terminal record keep their own lines.
    expect(lines.map((l) => l.message)).toContain('legacy runtime bootstrap converged');
  });

  test('a repair the box defers mid-script logs the verdict once, not twice', async () => {
    const calls: Calls = { execs: [], patches: [] };
    const lines: Array<{ message: string; context: unknown }> = [];
    const deps = verdictDeps(
      {
        exec: async (cmd) => {
          if (cmd.join(' ').includes('127.0.0.1:8000/kortix/health')) {
            return { exitCode: 7, stdout: '', stderr: '' };
          }
          calls.execs.push(cmd);
          return { exitCode: 0, stdout: '{"ok":true,"stage":"deferred_busy","token_rotated":false}\n', stderr: '' };
        },
      },
      calls,
      lines,
    );
    const r = await bootstrapLegacyRuntime(input(), deps);
    expect(r.outcome).toBe('skipped-busy');
    // The claim line ('legacy runtime bootstrap starting') stays; the verdict
    // is the only line about the deferral itself.
    expect(lines.map((l) => l.message).filter((m) => m !== 'legacy runtime bootstrap starting')).toEqual(['skipped: busy']);
  });

  test('a pinned daemon ships exactly one blocked line', async () => {
    const calls: Calls = { execs: [], patches: [] };
    const lines: Array<{ message: string; context: unknown }> = [];
    const pinned = {
      ...CURRENT_HEALTH,
      runtime: { ...CURRENT_HEALTH.runtime, pinned: true },
    };
    const r = await bootstrapLegacyRuntime(input(), verdictDeps({ health: [pinned] }, calls, lines));
    expect(r.outcome).toBe('skipped-blocked');
    expect(lines).toHaveLength(1);
    expect(lines[0].message).toBe('skipped: blocked');
    expect(String((lines[0].context as { detail?: string }).detail)).toContain('daemon has latched runtime updates off after a supervisor rollback');
  });
});
