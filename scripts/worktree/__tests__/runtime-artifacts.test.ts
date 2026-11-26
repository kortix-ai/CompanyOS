// agentArtifactCurrent: when `pnpm worktree start` may skip rebuilding the sandbox agent binary.
// startDocsBuild: the /docs build starts at the top of `worktree start`, detached.
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENT_INPUT_PACKAGES, agentArtifactCurrent, newestInputMtimeMs, startDocsBuild } from '../lib/services';

const T0 = new Date('2026-11-26T10:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function put(root: string, rel: string, when: Date): string {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, rel);
  utimesSync(p, when, when);
  return p;
}
function touchDir(root: string, rel: string, when: Date): void {
  utimesSync(join(root, rel), when, when);
}

/** A worktree whose inputs are all at T0 and whose binaries were built at T0+60 s. */
function worktree(): string {
  const wt = mkdtempSync(join(tmpdir(), 'wt-artifacts-'));
  put(wt, 'apps/kortix-sandbox-agent-server/src/main.ts', T0);
  put(wt, 'apps/kortix-sandbox-agent-server/package.json', T0);
  put(wt, 'packages/shared/src/runtime-versions.json', T0);
  put(wt, 'packages/api-contract/src/sandbox-layout.ts', T0);
  put(wt, 'packages/llm-catalog/src/catalog.generated.json', T0);
  put(wt, 'packages/starter/src/embedded.generated.json', T0);
  for (const f of ['pnpm-lock.yaml', 'package.json', 'tsconfig.base.json']) put(wt, f, T0);
  for (const d of ['apps/kortix-sandbox-agent-server/src', 'apps/kortix-sandbox-agent-server', 'packages/shared/src', 'packages/shared',
    'packages/api-contract/src', 'packages/api-contract', 'packages/llm-catalog/src', 'packages/llm-catalog',
    'packages/starter/src', 'packages/starter', 'packages']) touchDir(wt, d, T0);
  put(wt, 'apps/kortix-sandbox-agent-server/dist/kortix-agent', at(60));
  put(wt, 'apps/kortix-sandbox-agent-server/dist/kortixd', at(61));
  touchDir(wt, 'apps/kortix-sandbox-agent-server', T0);
  return wt;
}

describe('agentArtifactCurrent', () => {
  test('a binary newer than every input is current', () => {
    expect(agentArtifactCurrent(worktree())).toBe(true);
  });

  test('a worktree that never built the binary is not current', () => {
    const wt = worktree();
    rmSync(join(wt, 'apps/kortix-sandbox-agent-server/dist/kortixd'));
    expect(agentArtifactCurrent(wt)).toBe(false);
  });

  test('an edited source file rebuilds', () => {
    const wt = worktree();
    put(wt, 'apps/kortix-sandbox-agent-server/src/main.ts', at(120));
    expect(agentArtifactCurrent(wt)).toBe(false);
  });

  test('an edit in a workspace package it imports rebuilds', () => {
    const wt = worktree();
    put(wt, 'packages/api-contract/src/sandbox-layout.ts', at(120));
    expect(agentArtifactCurrent(wt)).toBe(false);
  });

  test('a dependency bump (lockfile) rebuilds', () => {
    const wt = worktree();
    put(wt, 'pnpm-lock.yaml', at(120));
    expect(agentArtifactCurrent(wt)).toBe(false);
  });

  test('a deleted source file rebuilds: its directory moved', () => {
    const wt = worktree();
    put(wt, 'apps/kortix-sandbox-agent-server/src/old.ts', T0);
    rmSync(join(wt, 'apps/kortix-sandbox-agent-server/src/old.ts'));
    touchDir(wt, 'apps/kortix-sandbox-agent-server/src', at(120));
    expect(agentArtifactCurrent(wt)).toBe(false);
  });

  test("the build's own staging in the package root does not read as a change", () => {
    const wt = worktree();
    touchDir(wt, 'apps/kortix-sandbox-agent-server', at(62));
    expect(agentArtifactCurrent(wt)).toBe(true);
  });

  test('the CLI build regenerating packages/starter does not rebuild the agent', () => {
    const wt = worktree();
    put(wt, 'packages/starter/src/embedded.generated.json', at(90));
    touchDir(wt, 'packages/starter/src', at(90));
    expect(agentArtifactCurrent(wt)).toBe(true);
  });

  test('an edit in llm-catalog, which it reaches transitively, rebuilds', () => {
    const wt = worktree();
    put(wt, 'packages/llm-catalog/src/catalog.generated.json', at(120));
    expect(agentArtifactCurrent(wt)).toBe(false);
  });

  test('build output and installed dependencies are not inputs', () => {
    const wt = worktree();
    put(wt, 'apps/kortix-sandbox-agent-server/node_modules/.cache/tsgo.tsbuildinfo', at(300));
    put(wt, 'packages/shared/node_modules/x/index.js', at(300));
    put(wt, 'apps/kortix-sandbox-agent-server/dist/kortix-agent.srchash', at(300));
    for (const d of ['apps/kortix-sandbox-agent-server', 'packages/shared']) touchDir(wt, d, T0);
    expect(agentArtifactCurrent(wt)).toBe(true);
  });
});

describe('newestInputMtimeMs', () => {
  test('a missing path is 0', () => {
    expect(newestInputMtimeMs(join(tmpdir(), 'no-such-path-for-wt-artifacts'))).toBe(0);
  });
});

// The input list is only as good as the import closure it claims. Walk the real sources: every @kortix/* package the
// agent's non-test sources import, transitively, must be an input, or an edit there would ship a stale binary.
describe('AGENT_INPUT_PACKAGES', () => {
  test("covers the agent's transitive @kortix imports", () => {
    const repo = join(import.meta.dir, '..', '..', '..');
    const dirOf = new Map<string, string>();
    for (const group of ['apps', 'packages']) {
      for (const d of readdirSync(join(repo, group))) {
        const file = join(repo, group, d, 'package.json');
        if (!existsSync(file)) continue;
        const name = (JSON.parse(readFileSync(file, 'utf8')) as { name?: string }).name;
        if (name) dirOf.set(name, `${group}/${d}`);
      }
    }
    const imported = (dir: string): string[] => {
      const out = Bun.spawnSync(['git', '-C', repo, 'grep', '-hoE', "['\"]@kortix/[a-z0-9-]+", '--', dir,
        ':!*__tests__*', ':!*.test.ts', ':!*.test.tsx', ':!*.spec.ts']).stdout.toString();
      return [...new Set([...out.matchAll(/(@kortix\/[a-z0-9-]+)/g)].map((m) => m[1]!))];
    };
    const reached = new Set<string>();
    const todo = ['apps/kortix-sandbox-agent-server/src'];
    while (todo.length) {
      for (const name of imported(todo.pop()!)) {
        const dir = dirOf.get(name);
        if (!dir || reached.has(dir)) continue;
        reached.add(dir);
        todo.push(dir);
      }
    }
    expect(reached.size).toBeGreaterThanOrEqual(3);
    for (const dir of reached) expect(AGENT_INPUT_PACKAGES.map((p) => `packages/${p}`), `the agent reaches ${dir}`).toContain(dir);
  });
});

describe('startDocsBuild', () => {
  function web(): { wt: string; log: string } {
    const wt = mkdtempSync(join(tmpdir(), 'wt-docs-'));
    // A stand-in for apps/web/scripts/blume-docs.mjs: buildBlumeDocs() leaves a marker in the cwd it runs in.
    put(wt, 'apps/web/scripts/blume-docs.mjs', T0);
    writeFileSync(join(wt, 'apps/web/scripts/blume-docs.mjs'),
      "import fs from 'node:fs';\nexport function buildBlumeDocs() { fs.writeFileSync('built-by-child', process.cwd()); }\n");
    return { wt, log: join(wt, 'logs', 'docs-build.log') };
  }

  test('runs buildBlumeDocs in apps/web, detached, when public/docs/ is missing', async () => {
    const { wt, log } = web();
    expect(startDocsBuild(wt, log)).toBe(true);
    const marker = join(wt, 'apps/web/built-by-child');
    for (let i = 0; i < 100 && !existsSync(marker); i++) await Bun.sleep(50);
    expect(readFileSync(marker, 'utf8')).toEndWith(join('apps', 'web'));
    expect(existsSync(log)).toBe(true);
  });

  test('starts nothing when public/docs/ is already built', () => {
    const { wt, log } = web();
    put(wt, 'apps/web/public/docs/index.html', T0);
    expect(startDocsBuild(wt, log)).toBe(false);
  });

  test('starts nothing in a checkout without the docs build', () => {
    expect(startDocsBuild(mkdtempSync(join(tmpdir(), 'wt-docs-none-')), join(tmpdir(), 'unused.log'))).toBe(false);
  });
});
