import { expect, test } from 'bun:test';
import { validateManifest } from '@kortix/manifest-schema';

const manifest = { default_agent: 'worker', agents: { worker: { model: 'test/model' } } };

test('workspace validator command is an explicit canonical manifest field', () => {
  expect(validateManifest({ ...manifest, config_validator: 'node scripts/policy.mjs' }).issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  for (const config_validator of ['', '  ', 42, {}, []]) {
    expect(validateManifest({ ...manifest, config_validator }).issues.some((issue) => issue.path === 'config_validator' && issue.severity === 'error')).toBe(true);
  }
});

import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkspaceValidator, type ValidatorBox } from './workspace-validator';

const localBox: ValidatorBox = {
  exec(command, timeoutMs) {
    return new Promise((resolve, reject) => {
      const [binary, ...args] = command;
      if (!binary) return reject(new Error('missing binary'));
      const child = spawn(binary, args, { env: { ...process.env, SYNTHETIC_PLATFORM_SECRET: 'must-not-leak' }, timeout: timeoutMs });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      child.on('error', reject);
      child.on('close', (exitCode) => resolve({ exitCode: exitCode ?? -1, stdout, stderr }));
    });
  },
};

test('validator runs the exact candidate including imports, clears env, returns diagnostics and cleans up', async () => {
  const root = await mkdtemp(join(tmpdir(), 'validator-contract-'));
  try {
    await writeFile(join(root, 'import.yaml'), 'connector: required\n');
    const archive = execFileSync('tar', ['-cf', '-', '-C', root, 'import.yaml']);
    await runWorkspaceValidator(localBox, 'test -z "$SYNTHETIC_PLATFORM_SECRET" && grep -q required import.yaml', archive);
    await expect(runWorkspaceValidator(localBox, 'echo "prohibited default model" >&2; exit 1', archive)).rejects.toThrow('prohibited default model');
    await expect(runWorkspaceValidator(localBox, 'echo "missing required connector" >&2; exit 1', archive)).rejects.toThrow('missing required connector');
    await expect(runWorkspaceValidator(localBox, 'grep -q missing import.yaml || { echo "refresh-prefix/guard inconsistency" >&2; exit 1; }', archive)).rejects.toThrow('refresh-prefix/guard inconsistency');
    const paths: string[][] = [];
    const broken: ValidatorBox = { async exec(command) { paths.push(command); if (command[0] === 'rm') return { exitCode: 0, stdout: '', stderr: '' }; throw new Error('provider timeout'); } };
    await expect(runWorkspaceValidator(broken, 'true', archive)).rejects.toThrow('provider timeout');
    expect(paths.at(-1)?.slice(0, 3)).toEqual(['rm', '-rf', '--']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { commitMultipleFilesToBranch } from './commit-writer';
import { setValidatorBoxForTests } from './workspace-validator';

test('real commit adapter rejects candidate policy violations and cannot disable the base validator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'validator-git-'));
  const previous = process.env.KORTIX_GIT_CACHE_DIR;
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    process.env.KORTIX_GIT_CACHE_DIR = join(root, 'cache');
    const seed = join(root, 'seed'); const remote = join(root, 'remote.git');
    git('init', '--initial-branch=main', seed);
    git('-C', seed, 'config', 'user.name', 'Synthetic');
    git('-C', seed, 'config', 'user.email', 'synthetic@example.test');
    const base = 'config_validator: bash policy.sh\nimports: [import.yaml]\ndefault_agent: worker\nagents:\n  worker:\n    model: allowed\n    connectors: all\n';
    await writeFile(join(seed, 'kortix.yaml'), base);
    await writeFile(join(seed, 'import.yaml'), '# refresh: guarded\nagents:\n  helper:\n    model: allowed\n');
    await writeFile(join(seed, 'policy.sh'), 'grep -q prohibited kortix.yaml && { echo "prohibited model" >&2; exit 1; }\ngrep -q "connectors: none" kortix.yaml && { echo "required connector" >&2; exit 1; }\ngrep -q "^# refresh: guarded$" import.yaml || { echo "refresh guard" >&2; exit 1; }\n');
    git('-C', seed, 'add', 'kortix.yaml', 'import.yaml', 'policy.sh'); git('-C', seed, 'commit', '-m', 'seed');
    git('init', '--bare', remote); git('-C', seed, 'push', remote, 'main'); git('--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    const project = { projectId: 'synthetic', repoUrl: remote, defaultBranch: 'main', manifestPath: 'kortix.yaml', gitAuthToken: 'synthetic' };
    setValidatorBoxForTests(async () => localBox);
    const tip = () => git('--git-dir', remote, 'rev-parse', 'main');
    const before = tip();
    for (const [path, content, diagnostic] of [
      ['kortix.yaml', base.replace('allowed', 'prohibited'), 'prohibited model'],
      ['kortix.yaml', base.replace('connectors: all', 'connectors: none'), 'required connector'],
      ['import.yaml', '# refresh: unprotected\nagents:\n  helper:\n    model: allowed\n', 'refresh guard'],
      ['kortix.yaml', base.replace('config_validator: bash policy.sh\n', '').replace('allowed', 'prohibited'), 'prohibited model'],
    ]) {
      if (!path || !content || !diagnostic) throw new Error('invalid fixture');
      await expect(commitMultipleFilesToBranch(project, { files: [{ path, content }], message: 'rejected' })).rejects.toThrow(diagnostic);
      expect(tip()).toBe(before);
    }
    // export-ignore cannot hide a prohibited import from the validator.
    await expect(commitMultipleFilesToBranch(project, { files: [
      { path: '.gitattributes', content: 'import.yaml export-ignore\n' },
      { path: 'import.yaml', content: '# refresh: unprotected\n' },
    ], message: 'archive attribute bypass' })).rejects.toThrow('refresh guard');
    expect(tip()).toBe(before);
    // export-subst must preserve literal bytes, not turn %s into "guarded".
    await expect(commitMultipleFilesToBranch(project, { files: [
      { path: '.gitattributes', content: 'import.yaml export-subst\n' },
      { path: 'import.yaml', content: '# refresh: $Format:%s$\n' },
    ], message: 'guarded' })).rejects.toThrow('refresh guard');
    expect(tip()).toBe(before);
    setValidatorBoxForTests(async () => { throw new Error('required validator unavailable'); });
    await expect(commitMultipleFilesToBranch(project, { files: [{ path: 'kortix.yaml', content: base }], message: 'unavailable' })).rejects.toMatchObject({ code: 'manifest_invalid' });
    expect(tip()).toBe(before);
    setValidatorBoxForTests(async () => ({ async exec(command) { return { exitCode: command[0] === 'rm' ? 0 : 124, stdout: '', stderr: 'validator timeout' }; } }));
    await expect(commitMultipleFilesToBranch(project, { files: [{ path: 'kortix.yaml', content: base }], message: 'timed out' })).rejects.toMatchObject({ code: 'manifest_invalid' });
    expect(tip()).toBe(before);
    setValidatorBoxForTests(async () => localBox);
    const saved = await commitMultipleFilesToBranch(project, { files: [{ path: 'kortix.yaml', content: base.replace('allowed', 'accepted') }], message: 'allowed' });
    expect(tip()).toBe(saved.commitSha);
    expect(git('--git-dir', remote, 'show', 'main:kortix.yaml')).toContain('model: accepted');
    let moved = false;
    setValidatorBoxForTests(async () => ({ async exec(command, timeoutMs) {
      const result = await localBox.exec(command, timeoutMs);
      if (!moved && command.join(' ').includes('timeout --kill-after')) {
        moved = true;
        await writeFile(join(seed, 'import.yaml'), '# refresh: unprotected\nagents:\n  helper:\n    model: allowed\n');
        git('-C', seed, 'add', 'import.yaml'); git('-C', seed, 'commit', '-m', 'concurrent guard change');
        git('-C', seed, 'push', '--force', remote, 'main');
      }
      return result;
    } }));
    await expect(commitMultipleFilesToBranch(project, { files: [{ path: 'kortix.yaml', content: base }], message: 'race' })).rejects.toThrow('changed since it was read');
    const raced = tip();
    setValidatorBoxForTests(async () => localBox);
    await expect(commitMultipleFilesToBranch(project, { files: [{ path: 'kortix.yaml', content: base }], message: 'retry on new base' })).rejects.toThrow('refresh guard');
    expect(tip()).toBe(raced);

  } finally {
    setValidatorBoxForTests(null);
    if (previous === undefined) delete process.env.KORTIX_GIT_CACHE_DIR; else process.env.KORTIX_GIT_CACHE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
