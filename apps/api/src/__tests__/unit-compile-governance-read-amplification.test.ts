/**
 * The governance compile behind every session's 60 s config-release tick must
 * not amplify a base move into a per-file git fetch storm (KRTX-4740: a wave
 * of base-branch moves made every tick rebuild its release by faulting ONE
 * blob per prompt file — 40-260 serialized `git fetch` processes per request,
 * p95 7884 ms on POST …/config-release).
 *
 * Two behaviors are pinned:
 *   1. `readPromptFiles` batch-prefetches every prompt file in ONE object
 *      fetch (`prefetchRepoFiles`) before the per-file reads — the same fix
 *      `loadProjectConfig` got for skills (2026-11-03).
 *   2. The compiled-config cache holds the fleet's working set (~30 active
 *      projects x variants), so a steady-state tick does not re-read and
 *      recompile every prompt file from scratch.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const realFiles = await import('../projects/git/files');

// Capture BEFORE mock.module: the module namespace is live, so a wrapper that
// reads `realFiles.readRepoFile` at call time would recurse into itself.
const realReadRepoFile = realFiles.readRepoFile;
const realPrefetchRepoFiles = realFiles.prefetchRepoFiles;

const prefetchCalls: Array<{ projectId: string; paths: string[] }> = [];
const readFileCalls: string[] = [];

mock.module('../projects/git/files', () => ({
  ...realFiles,
  prefetchRepoFiles: async (
    project: Parameters<typeof realPrefetchRepoFiles>[0],
    paths: readonly string[],
    ref?: string,
  ) => {
    prefetchCalls.push({ projectId: project.projectId, paths: [...paths] });
    return realPrefetchRepoFiles(project, paths, ref);
  },
  readRepoFile: async (
    project: Parameters<typeof realReadRepoFile>[0],
    path: string,
    ref?: string,
  ) => {
    readFileCalls.push(`${project.projectId}:${path}`);
    return realReadRepoFile(project, path, ref);
  },
}));

const { resolveCompiledAgentConfigForSession, __resetCompiledAtCommitForTests } = await import(
  '../projects/lib/compile-agent-config'
);
type GitBackedProject = Parameters<typeof resolveCompiledAgentConfigForSession>[0];

let root = '';
let work = '';
let remote = '';
const previousCache = process.env.KORTIX_GIT_CACHE_DIR;

function run(cmd: string, args: string[], cwd: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}
const git = (...args: string[]) => run('git', args, work);

const AGENTS = ['scout', 'reviewer', 'writer', 'tester'];

function project(id: string): GitBackedProject {
  return {
    projectId: id,
    repoUrl: remote,
    defaultBranch: 'main',
    manifestPath: 'kortix.yaml',
    gitAuthToken: 'local-test',
  };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'kortix-compile-prefetch-'));
  process.env.KORTIX_GIT_CACHE_DIR = join(root, 'git-cache');
  work = join(root, 'work');
  remote = join(root, 'remote.git');
  run('git', ['init', '-q', '--bare', '--initial-branch=main', remote], root);
  run('git', ['init', '-q', '--initial-branch=main', work], root);
  git('config', 'user.email', 't@kortix.invalid');
  git('config', 'user.name', 'T');
  git('remote', 'add', 'origin', remote);
  const manifest = [
    'project:',
    '  name: prefetch-test',
    'default_agent: scout',
    'agents:',
    ...AGENTS.flatMap((name) => [`  ${name}:`, `    prompt_file: agents/${name}.md`]),
    '',
  ].join('\n');
  const files: Record<string, string> = { 'kortix.yaml': manifest };
  for (const name of AGENTS) files[`agents/${name}.md`] = `You are ${name}.\n`;
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(work, rel.split('/').slice(0, -1).join('/') || '.'), { recursive: true });
    writeFileSync(join(work, rel), body);
  }
  git('add', '-A');
  git('commit', '-qm', 'seed');
  git('push', '-q', 'origin', 'main');
});

afterAll(() => {
  if (previousCache === undefined) delete process.env.KORTIX_GIT_CACHE_DIR;
  else process.env.KORTIX_GIT_CACHE_DIR = previousCache;
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  __resetCompiledAtCommitForTests();
  prefetchCalls.length = 0;
  readFileCalls.length = 0;
});

describe('the governance compile of a prompt-heavy manifest', () => {
  test('batch-prefetches every prompt file in one object fetch, not one per file', async () => {
    const compiled = await resolveCompiledAgentConfigForSession(project('prefetch-one'), 'main');
    expect(compiled).not.toBeNull();
    for (const name of AGENTS) expect(compiled).toContain(name);

    expect(prefetchCalls).toHaveLength(1);
    expect(prefetchCalls[0]?.projectId).toBe('prefetch-one');
    expect(prefetchCalls[0]?.paths.sort()).toEqual(AGENTS.map((name) => `agents/${name}.md`).sort());
    // The per-file reads still happen (through the cache), once per file.
    expect(readFileCalls).toHaveLength(AGENTS.length);
  });

  test('a compile whose cache entry survives does not re-read the prompt files', async () => {
    // 34 distinct projects: just over the old 32-entry bound, the size of a
    // busy fleet's active (project x variant) working set.
    const projects = Array.from({ length: 34 }, (_, i) => project(`prefetch-lru-${i}`));
    for (const p of projects) await resolveCompiledAgentConfigForSession(p, 'main');
    expect(readFileCalls.length).toBeGreaterThan(0);
    readFileCalls.length = 0;

    for (const p of projects) await resolveCompiledAgentConfigForSession(p, 'main');
    expect(readFileCalls).toHaveLength(0);
  });
});
