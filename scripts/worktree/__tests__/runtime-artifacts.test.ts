// agentArtifactCurrent: when `pnpm worktree start` may skip rebuilding the sandbox agent binary.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentArtifactCurrent, newestInputMtimeMs } from '../lib/services';

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
  put(wt, 'packages/llm-gateway/src/pipeline/image-window.ts', T0);
  for (const f of ['pnpm-lock.yaml', 'package.json', 'tsconfig.base.json']) put(wt, f, T0);
  for (const d of ['apps/kortix-sandbox-agent-server/src', 'apps/kortix-sandbox-agent-server', 'packages/shared/src', 'packages/shared',
    'packages/llm-gateway/src/pipeline', 'packages/llm-gateway/src', 'packages/llm-gateway', 'packages']) touchDir(wt, d, T0);
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
    put(wt, 'packages/llm-gateway/src/pipeline/image-window.ts', at(120));
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
