import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CLONE_INTO_WORKSPACE_COMMAND } from '../src/fixtures/clone-into-workspace';

// The command names /workspace, so the test runs it with /workspace rewritten
// to a temp directory. Everything else is the exact string the flow sends.
const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'clone-into-workspace-'));
  roots.push(root);
  return root;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function commit(cwd: string, file: string, content: string): string {
  writeFileSync(join(cwd, file), content);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-qm', file);
  return git(cwd, 'rev-parse', 'HEAD');
}

/** A source repository with one commit, and the command pointed at a target. */
function fixture(): { source: string; target: string; command: string; base: string } {
  const root = tempRoot();
  const source = join(root, 'source');
  mkdirSync(source);
  git(source, 'init', '-q');
  git(source, 'config', 'user.email', 'test@example.test');
  git(source, 'config', 'user.name', 'test');
  const base = commit(source, 'README.md', 'hello\n');

  const target = join(root, 'workspace');
  mkdirSync(target);
  const command = CLONE_INTO_WORKSPACE_COMMAND.replaceAll('/workspace', target);
  return { source, target, command, base };
}

function run(command: string, source: string, branch: string): string {
  return execFileSync('bash', ['-c', command], {
    encoding: 'utf8',
    env: { ...process.env, KORTIX_REPO_URL: source, KORTIX_BRANCH_NAME: branch },
  }).trim();
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('CLONE_INTO_WORKSPACE_COMMAND', () => {
  it('clones into an empty workspace and prints the default branch HEAD', () => {
    const { source, target, command, base } = fixture();
    expect(run(command, source, 'session-branch')).toBe(base);
    expect(git(target, 'rev-parse', 'HEAD')).toBe(base);
  });

  it('checks out the session branch when the remote already has it', () => {
    const { source, target, command, base } = fixture();
    // A previous push on this session left work on the session branch.
    git(source, 'checkout', '-q', '-b', 'session-branch');
    const sessionHead = commit(source, 'session.txt', 'session work\n');
    git(source, 'checkout', '-q', '-');

    expect(run(command, source, 'session-branch')).toBe(sessionHead);
    expect(git(target, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('session-branch');
    expect(git(target, 'rev-parse', 'HEAD')).not.toBe(base);
  });

  it('leaves an existing checkout alone, so the box checkout survives', () => {
    const { source, target, command } = fixture();
    git(target, 'init', '-q');
    git(target, 'config', 'user.email', 'test@example.test');
    git(target, 'config', 'user.name', 'test');
    git(target, 'remote', 'add', 'origin', source);
    git(target, 'fetch', '-q', 'origin');
    git(
      target,
      'checkout',
      '-q',
      '-B',
      'session-branch',
      `origin/${git(source, 'rev-parse', '--abbrev-ref', 'HEAD')}`,
    );
    const sessionHead = commit(target, 'session.txt', 'session work\n');

    expect(run(command, source, 'session-branch')).toBe(sessionHead);
    expect(git(target, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('session-branch');
  });
});
