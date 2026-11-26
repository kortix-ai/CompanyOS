/**
 * Unit test (no database, no box): the pieces of the workspace cache's daily
 * rebuild (projects/workspace-cache/builder.ts) that decide what runs and what
 * is saved.
 *
 * - The box command runs the project's own builder from the served config, as
 *   the runtime user, detached, with the cache's env, and keeps its exit code.
 * - Only a final `workspace-cache-key: ws-…` line of a valid key is saved.
 * - A builder is recorded only with an agent and a person.
 */
import { describe, expect, test } from 'bun:test';

const {
  builderCommand,
  buildPollCommand,
  parseBuildPoll,
  keyFromBuilderOutput,
  workspaceCacheBuilderOf,
  REBUILD_AFTER_MS,
  BUILD_TIMEOUT_MS,
} = await import('../projects/workspace-cache/builder');
const { mkdtempSync, writeFileSync } = await import('node:fs');
const { join } = await import('node:path');
const { tmpdir } = await import('node:os');

const NS = 'proj:05b9519d-ca06-4cdd-9825-3cbc3ac3c389:ws';

describe('builderCommand', () => {
  const cmd = builderCommand(NS);

  test('runs the served config builder as the runtime user, detached, with the cache env', () => {
    expect(cmd).toContain('nohup runuser -u kortix -- env ');
    expect(cmd).toContain(`KORTIX_WORKSPACE_CACHE='${NS}'`);
    expect(cmd).toContain('npm_config_store_dir=/workspace/.pnpm-store');
    expect(cmd).toContain('ls -dt /opt/kortix/config/*/');
    expect(cmd).toContain('scripts/workspace-cache-build');
    expect(cmd.trim().endsWith('&')).toBe(true);
  });

  test('keeps the exit code and the output, and says so when the project ships no builder', () => {
    expect(cmd).toContain('echo $? > /tmp/workspace-cache-build.exit');
    expect(cmd).toContain('> /tmp/workspace-cache-build.out 2>&1');
    expect(cmd).toContain('echo 127 > /tmp/workspace-cache-build.exit');
    expect(cmd.startsWith('rm -f /tmp/workspace-cache-build.out /tmp/workspace-cache-build.exit;')).toBe(true);
  });

  test('a namespace cannot break out of its quotes', () => {
    expect(builderCommand("a'; rm -rf / #")).toContain(`KORTIX_WORKSPACE_CACHE='a'\\''; rm -rf / #'`);
  });

  test('the generated script parses as bash', async () => {
    const proc = Bun.spawn(['bash', '-n', '-c', cmd]);
    expect(await proc.exited).toBe(0);
  });
});

describe('build poll', () => {
  const poll = async (files: { exit?: string; out?: string }) => {
    const dir = mkdtempSync(join(tmpdir(), 'wcb-poll-'));
    const exitPath = join(dir, 'exit');
    const outPath = join(dir, 'out');
    if (files.exit !== undefined) writeFileSync(exitPath, files.exit);
    if (files.out !== undefined) writeFileSync(outPath, files.out);
    const proc = Bun.spawn(['bash', '-c', buildPollCommand(exitPath, outPath)], { stdout: 'pipe' });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return parseBuildPoll(stdout);
  };

  test('a running builder (no exit file yet) is in flight, not failed', async () => {
    // 2026-11-26: the old `cat exit; echo ---` read failed every build on its first poll.
    expect((await poll({ out: 'workspace-cache-build: on origin/dev 8850e34cdd11\n' })).exit).toBeNull();
    expect((await poll({})).exit).toBeNull();
    expect((await poll({ exit: '', out: 'x\n' })).exit).toBeNull();
  });

  test('a finished builder gives its exit code and output, and the key parses', async () => {
    const r = await poll({ exit: '0\n', out: '--- noise ---\n---\nworkspace-cache-key: ws-c05e329afa10-a47567a3-202611261400\n' });
    expect(r.exit).toBe('0');
    expect(keyFromBuilderOutput(r.out)).toBe('ws-c05e329afa10-a47567a3-202611261400');
  });

  test('a failed builder gives its code', async () => {
    const r = await poll({ exit: '1\n', out: 'workspace-cache-build: fetch of origin/dev failed\n' });
    expect(r.exit).toBe('1');
    expect(r.out).toContain('fetch of origin/dev failed');
  });

  test('a reply that is not a poll is in flight, never a failure', () => {
    expect(parseBuildPoll('').exit).toBeNull();
    expect(parseBuildPoll('---\nsomething').exit).toBeNull();
  });
});

describe('keyFromBuilderOutput', () => {
  test('takes the key from the last line only', () => {
    expect(keyFromBuilderOutput('workspace-cache-build: ready\nworkspace-cache-key: ws-c05e329afa10-a47567a3-202611261206\n')).toBe(
      'ws-c05e329afa10-a47567a3-202611261206',
    );
  });
  test('refuses a missing, malformed or earlier key', () => {
    expect(keyFromBuilderOutput('')).toBeNull();
    expect(keyFromBuilderOutput('workspace-cache-key: k-1')).toBeNull();
    expect(keyFromBuilderOutput('workspace-cache-key: ws-a b')).toBeNull();
    expect(keyFromBuilderOutput('workspace-cache-key: ws-abc\nsomething after')).toBeNull();
  });
});

describe('workspaceCacheBuilderOf', () => {
  test('reads a recorded builder', () => {
    expect(workspaceCacheBuilderOf({ workspace_cache: { agent: 'engineering', user_id: 'u1', named_at: '2026-11-26T12:00:00Z' } })).toEqual({
      agent: 'engineering',
      user_id: 'u1',
      named_at: '2026-11-26T12:00:00Z',
    });
  });
  test('needs both the agent and the person', () => {
    expect(workspaceCacheBuilderOf({})).toBeNull();
    expect(workspaceCacheBuilderOf({ workspace_cache: { agent: 'engineering' } })).toBeNull();
    expect(workspaceCacheBuilderOf({ workspace_cache: { user_id: 'u1' } })).toBeNull();
    expect(workspaceCacheBuilderOf(null)).toBeNull();
  });
});

test('a day between builds, 45 min for one', () => {
  expect(REBUILD_AFTER_MS).toBe(86_400_000);
  expect(BUILD_TIMEOUT_MS).toBe(2_700_000);
});
