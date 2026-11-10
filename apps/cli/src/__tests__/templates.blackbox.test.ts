import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// `kortix templates add <id>` adds a template to an existing repository: its
// .kortix/<id>/ folder plus one line under imports: in kortix.yaml. The
// one-prompt setup guide runs it with --json and acts on `next`.

const CLI_ENTRY = join(resolve(import.meta.dir, '..', '..'), 'src', 'index.ts');
let repo: string;

function kortix(args: string[]) {
  const home = join(repo, '.home');
  const r = spawnSync('bun', [CLI_ENTRY, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home, KORTIX_NO_UPDATE_CHECK: '1', NO_COLOR: '1' },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function git(args: string[]) {
  spawnSync('git', args, { cwd: repo });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'kortix-templates-'));
  git(['init', '-q', '-b', 'main']);
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

test('ls --json lists the four hand-approved templates', () => {
  const r = kortix(['templates', 'ls', '--json']);
  expect(r.code).toBe(0);
  const ids = (JSON.parse(r.stdout) as { templates: Array<{ id: string }> }).templates.map((t) => t.id);
  expect(ids).toEqual(['software-factory', 'security-loop', 'aeo-loop', 'changelog']);
});

test('add into a repository with kortix.yaml: files written, import appended, comments kept, placeholders resolved', () => {
  git(['remote', 'add', 'origin', 'https://github.com/acme/shop.git']);
  writeFileSync(join(repo, 'kortix.yaml'), '# mine\nproject:\n  name: shop # keep\n');
  const r = kortix(['templates', 'add', 'software-factory', '--json']);
  expect(r.code).toBe(0);
  const out = JSON.parse(r.stdout);
  expect(out).toMatchObject({ template: 'software-factory', repository: 'acme/shop', default_branch: 'main', manifest_created: false, import: 'added' });
  expect(out.next.github_webhooks.map((h: { trigger: string }) => h.trigger)).toEqual(['factory-issues', 'factory-pull-requests']);
  const manifest = readFileSync(join(repo, 'kortix.yaml'), 'utf8');
  expect(manifest).toContain('# mine');
  expect(manifest).toContain('# keep');
  expect(manifest).toMatch(/imports:\n\s+- \.kortix\/software-factory\//);
  const builder = readFileSync(join(repo, '.kortix/software-factory/prompts/builder.md'), 'utf8');
  expect(builder).toContain('acme/shop');
  expect(builder).not.toContain('{{');

  const again = kortix(['templates', 'add', 'software-factory', '--json']);
  expect(again.code).toBe(0);
  expect(JSON.parse(again.stdout)).toMatchObject({ import: 'present', written: [] });
});

test('a changed template file is refused without --force and replaced with it', () => {
  expect(kortix(['templates', 'add', 'changelog', '--repo', 'acme/shop']).code).toBe(0);
  const file = join(repo, '.kortix/changelog/changelog.yaml');
  writeFileSync(file, `${readFileSync(file, 'utf8')}# local edit\n`);
  const refused = kortix(['templates', 'add', 'changelog', '--repo', 'acme/shop']);
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain('.kortix/changelog/changelog.yaml');
  expect(kortix(['templates', 'add', 'changelog', '--repo', 'acme/shop', '--force']).code).toBe(0);
  expect(readFileSync(file, 'utf8')).not.toContain('# local edit');
});

test('no kortix.yaml: one is created with My Kortix and the import; no GitHub remote and no --repo is refused', () => {
  const refused = kortix(['templates', 'add', 'aeo-loop']);
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain('--repo <owner/repo>');
  expect(existsSync(join(repo, 'kortix.yaml'))).toBe(false);

  const r = kortix(['templates', 'add', 'aeo-loop', '--repo', 'acme/site', '--branch', 'trunk', '--json']);
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout)).toMatchObject({ manifest_created: true, default_branch: 'trunk' });
  const manifest = readFileSync(join(repo, 'kortix.yaml'), 'utf8');
  expect(manifest).toContain('my_kortix: true');
  expect(manifest).toContain('- .kortix/aeo-loop/');
});

test('an unknown template is refused with the list', () => {
  const r = kortix(['templates', 'add', 'nope']);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain('software-factory, security-loop, aeo-loop, changelog');
});
