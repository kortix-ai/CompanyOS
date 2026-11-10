/**
 * The read-only baseline `kortix plan` prints: the repository, its stack, its
 * env files key by key and the integrations it uses. Deterministic: the same
 * tree gives the same report. Env values are read in this process only to
 * classify a key; no value, and no part of one, enters the result.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { pointsAtRemote } from '../commands/env.ts';
import { githubRepoFromRemote } from '../github-remote.ts';
import { runGit } from '../git-run.ts';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.venv', 'venv', 'target', 'vendor',
  'coverage', '.cache', 'out', '.output', '.vercel', '.wrangler', '.svelte-kit', '__pycache__', '.pnpm-store',
]);
const MAX_DEPTH = 5;

function rel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/') || '.';
}

function readText(abs: string): string | null {
  try {
    const info = statSync(abs);
    if (!info.isFile() || info.size > 1024 * 1024) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

function readJson(abs: string): Record<string, unknown> | null {
  const text = readText(abs);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Every file under `root` to MAX_DEPTH, repo-relative, sorted, without build and dependency folders. */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && depth < MAX_DEPTH) walk(abs, depth + 1);
      } else if (entry.isFile()) {
        out.push(rel(root, abs));
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

// ── Repository ───────────────────────────────────────────────────────────────

export interface RepositoryReport {
  root: string;
  git: boolean;
  github: { owner: string; repo: string } | null;
  /** `github`, `other` (a remote that is not on github.com) or `none`. */
  origin: 'github' | 'other' | 'none';
  default_branch: string | null;
  current_branch: string | null;
  clean: boolean;
  changed_files: number;
  layout: { workspaces: string[]; apps: string[]; packages: string[] };
}

function expandWorkspaceGlobs(root: string, patterns: string[]): string[] {
  const dirs = new Set<string>();
  for (const raw of patterns) {
    if (raw.startsWith('!')) continue;
    const pattern = raw.replace(/\/+$/, '').replace(/^\.\//, '');
    const star = pattern.indexOf('*');
    if (star === -1) {
      if (existsSync(join(root, pattern, 'package.json'))) dirs.add(pattern);
      continue;
    }
    const parent = pattern.slice(0, star).replace(/\/$/, '');
    const recursive = pattern.includes('**');
    const walk = (dir: string, depth: number) => {
      let entries;
      try {
        entries = readdirSync(join(root, dir), { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
        const child = dir ? `${dir}/${entry.name}` : entry.name;
        if (existsSync(join(root, child, 'package.json'))) dirs.add(child);
        if (recursive && depth < 3) walk(child, depth + 1);
      }
    };
    walk(parent, 0);
  }
  return [...dirs].sort();
}

function workspaceDirs(root: string, files: Set<string>): { tools: string[]; dirs: string[] } {
  const tools: string[] = [];
  const patterns: string[] = [];
  if (files.has('pnpm-workspace.yaml')) {
    try {
      // A pnpm-workspace.yaml with no `packages` only holds settings: not a monorepo.
      const doc = parseYaml(readText(join(root, 'pnpm-workspace.yaml')) ?? '') as { packages?: unknown };
      if (Array.isArray(doc?.packages) && doc.packages.length > 0) {
        tools.push('pnpm');
        patterns.push(...doc.packages.filter((p): p is string => typeof p === 'string'));
      }
    } catch {
      /* an unparsable workspace file lists no packages */
    }
  }
  const pkg = readJson(join(root, 'package.json'));
  const ws = pkg?.workspaces;
  const wsList = Array.isArray(ws) ? ws : ws && typeof ws === 'object' ? (ws as { packages?: unknown }).packages : null;
  if (Array.isArray(wsList)) {
    tools.push(files.has('yarn.lock') ? 'yarn' : files.has('bun.lock') || files.has('bun.lockb') ? 'bun' : 'npm');
    patterns.push(...wsList.filter((p): p is string => typeof p === 'string'));
  }
  if (files.has('turbo.json')) tools.push('turbo');
  if (files.has('nx.json')) tools.push('nx');
  if (files.has('lerna.json')) tools.push('lerna');
  return { tools, dirs: expandWorkspaceGlobs(root, patterns) };
}

export function scanRepository(root: string, files: Set<string>): RepositoryReport {
  const inside = runGit(root, ['rev-parse', '--is-inside-work-tree']);
  const git = inside.ok && inside.stdout.trim() === 'true';
  const remote = git ? runGit(root, ['remote', 'get-url', 'origin']) : null;
  const github = remote?.ok ? githubRepoFromRemote(remote.stdout) : null;
  const head = git ? runGit(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']) : null;
  const current = git ? runGit(root, ['branch', '--show-current']).stdout.trim() || null : null;
  const porcelain = git ? runGit(root, ['status', '--porcelain']).stdout.split('\n').filter(Boolean) : [];
  const { tools, dirs } = workspaceDirs(root, files);
  return {
    root,
    git,
    github: github ? { owner: github.split('/')[0]!, repo: github.split('/')[1]! } : null,
    origin: github ? 'github' : remote?.ok ? 'other' : 'none',
    default_branch: head?.ok && head.stdout.trim() ? head.stdout.trim().replace(/^origin\//, '') : current,
    current_branch: current,
    clean: porcelain.length === 0,
    changed_files: porcelain.length,
    layout: {
      workspaces: tools,
      apps: dirs.filter((dir) => /^(apps|services)\//.test(dir)),
      packages: dirs.filter((dir) => !/^(apps|services)\//.test(dir)),
    },
  };
}

// ── Stack ────────────────────────────────────────────────────────────────────

export interface StackReport {
  languages: Array<{ name: string; version: string | null; evidence: string }>;
  package_managers: Array<{ name: string; lockfile: string | null; version: string | null }>;
  services: Array<{ name: string; kind: string; evidence: string }>;
  commands: Array<{ name: string; command: string; package: string }>;
  ci: Array<{ workflow: string; on: string[]; runs: string[] }>;
  browser_tests: Array<{ tool: string; evidence: string }>;
}

const SCRIPT_NAME = /^(dev|start|serve|build|test|test:[\w:-]+|e2e|e2e:[\w:-]+|lint|typecheck|type-check|check|format|db:[\w:-]+|migrate)$/;

function firstMatch(text: string | null, re: RegExp): string | null {
  const match = text?.match(re);
  return match ? match[1]!.trim() : null;
}

function packageJsons(root: string, repo: RepositoryReport): Array<{ dir: string; pkg: Record<string, unknown> }> {
  const dirs = ['.', ...repo.layout.apps, ...repo.layout.packages];
  return dirs
    .map((dir) => ({ dir, pkg: readJson(join(root, dir, 'package.json')) }))
    .filter((row): row is { dir: string; pkg: Record<string, unknown> } => row.pkg !== null);
}

function depsOf(pkg: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = pkg[key];
    if (block && typeof block === 'object') names.push(...Object.keys(block as Record<string, unknown>));
  }
  return names;
}

function composeServices(root: string, files: string[]): StackReport['services'] {
  const out: StackReport['services'] = [];
  for (const file of files.filter((f) => /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(f))) {
    try {
      const doc = parseYaml(readText(join(root, file)) ?? '') as { services?: Record<string, { image?: unknown }> };
      for (const [name, svc] of Object.entries(doc?.services ?? {})) {
        const image = typeof svc?.image === 'string' ? svc.image.split(':')[0]! : 'build';
        out.push({ name, kind: `docker-compose (${image})`, evidence: file });
      }
    } catch {
      out.push({ name: basename(file), kind: 'docker-compose (unparsable)', evidence: file });
    }
  }
  return out;
}

function ciWorkflows(root: string, files: string[]): StackReport['ci'] {
  const out: StackReport['ci'] = [];
  for (const file of files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f))) {
    try {
      const doc = parseYaml(readText(join(root, file)) ?? '') as { on?: unknown; true?: unknown; jobs?: Record<string, { steps?: Array<{ run?: unknown }> }> };
      const on = doc?.on ?? doc?.true;
      const events = typeof on === 'string' ? [on] : Array.isArray(on) ? on.map(String) : on && typeof on === 'object' ? Object.keys(on) : [];
      const runs: string[] = [];
      for (const job of Object.values(doc?.jobs ?? {})) {
        for (const step of job?.steps ?? []) {
          if (typeof step?.run !== 'string') continue;
          for (const line of step.run.split('\n').map((l) => l.trim()).filter(Boolean)) {
            const short = line.length > 160 ? `${line.slice(0, 157)}...` : line;
            if (!runs.includes(short) && runs.length < 12) runs.push(short);
          }
        }
      }
      out.push({ workflow: file, on: events, runs });
    } catch {
      out.push({ workflow: file, on: [], runs: [] });
    }
  }
  return out;
}

export function scanStack(root: string, fileList: string[], repo: RepositoryReport): StackReport {
  const files = new Set(fileList);
  const pkgs = packageJsons(root, repo);
  const rootPkg = pkgs.find((row) => row.dir === '.')?.pkg ?? null;
  const toolVersions = readText(join(root, '.tool-versions'));
  const languages: StackReport['languages'] = [];
  const lang = (name: string, version: string | null, evidence: string) => {
    if (!languages.some((l) => l.name === name)) languages.push({ name, version, evidence });
  };
  const engines = rootPkg?.engines as Record<string, unknown> | undefined;
  if (files.has('.nvmrc')) lang('node', readText(join(root, '.nvmrc'))?.trim() || null, '.nvmrc');
  else if (files.has('.node-version')) lang('node', readText(join(root, '.node-version'))?.trim() || null, '.node-version');
  else if (firstMatch(toolVersions, /^nodejs\s+(\S+)/m)) lang('node', firstMatch(toolVersions, /^nodejs\s+(\S+)/m), '.tool-versions');
  else if (typeof engines?.node === 'string') lang('node', engines.node, 'package.json engines');
  else if (rootPkg) lang('node', null, 'package.json');
  if (files.has('bun.lock') || files.has('bun.lockb') || typeof engines?.bun === 'string') lang('bun', typeof engines?.bun === 'string' ? engines.bun : firstMatch(toolVersions, /^bun\s+(\S+)/m), files.has('bun.lock') ? 'bun.lock' : 'package.json');
  if (files.has('pyproject.toml') || files.has('requirements.txt') || files.has('.python-version')) {
    const version = readText(join(root, '.python-version'))?.trim() || firstMatch(readText(join(root, 'pyproject.toml')), /requires-python\s*=\s*["']([^"']+)["']/) || firstMatch(toolVersions, /^python\s+(\S+)/m);
    lang('python', version || null, files.has('pyproject.toml') ? 'pyproject.toml' : files.has('.python-version') ? '.python-version' : 'requirements.txt');
  }
  if (files.has('go.mod')) lang('go', firstMatch(readText(join(root, 'go.mod')), /^go\s+(\S+)/m), 'go.mod');
  if (files.has('Cargo.toml')) lang('rust', firstMatch(readText(join(root, 'rust-toolchain.toml')), /channel\s*=\s*"([^"]+)"/) ?? readText(join(root, 'rust-toolchain'))?.trim() ?? null, 'Cargo.toml');
  if (files.has('Gemfile')) lang('ruby', readText(join(root, '.ruby-version'))?.trim() || null, 'Gemfile');
  if (files.has('pom.xml') || files.has('build.gradle') || files.has('build.gradle.kts')) lang('java', firstMatch(toolVersions, /^java\s+(\S+)/m), files.has('pom.xml') ? 'pom.xml' : 'build.gradle');
  if (files.has('deno.json') || files.has('deno.jsonc')) lang('deno', null, files.has('deno.json') ? 'deno.json' : 'deno.jsonc');

  const managers: StackReport['package_managers'] = [];
  const declared = typeof rootPkg?.packageManager === 'string' ? rootPkg.packageManager : null;
  const lockfiles: Array<[string, string]> = [
    ['pnpm', 'pnpm-lock.yaml'], ['npm', 'package-lock.json'], ['yarn', 'yarn.lock'], ['bun', 'bun.lock'], ['bun', 'bun.lockb'],
    ['uv', 'uv.lock'], ['poetry', 'poetry.lock'], ['pipenv', 'Pipfile.lock'], ['pip', 'requirements.txt'],
    ['go', 'go.sum'], ['cargo', 'Cargo.lock'], ['bundler', 'Gemfile.lock'],
  ];
  for (const [name, lockfile] of lockfiles) {
    if (!files.has(lockfile) || managers.some((m) => m.name === name)) continue;
    const version = declared?.startsWith(`${name}@`) ? declared.slice(name.length + 1).split('+')[0]! : null;
    managers.push({ name, lockfile, version });
  }
  if (declared && !managers.some((m) => declared.startsWith(`${m.name}@`))) {
    const [name, version] = declared.split('@');
    managers.push({ name: name!, lockfile: null, version: version?.split('+')[0] ?? null });
  }

  const allDeps = new Set(pkgs.flatMap((row) => depsOf(row.pkg)));
  const services = composeServices(root, fileList);
  if (files.has('convex.json') || fileList.some((f) => /^convex\/[^/]+\.(ts|js)$/.test(f)) || allDeps.has('convex')) services.push({ name: 'convex', kind: 'convex', evidence: files.has('convex.json') ? 'convex.json' : files.has('convex/schema.ts') ? 'convex/schema.ts' : fileList.find((f) => /^convex\/[^/]+$/.test(f)) ?? 'package.json' });
  if (files.has('supabase/config.toml')) services.push({ name: 'supabase', kind: 'supabase (local stack)', evidence: 'supabase/config.toml' });
  const prisma = fileList.find((f) => f.endsWith('schema.prisma'));
  if (prisma) services.push({ name: 'prisma', kind: `prisma (${firstMatch(readText(join(root, prisma)), /provider\s*=\s*"(postgresql|mysql|sqlite|mongodb|sqlserver|cockroachdb)"/) ?? 'database'})`, evidence: prisma });
  const drizzle = fileList.find((f) => /(^|\/)drizzle\.config\.(ts|js|mjs)$/.test(f));
  if (drizzle) services.push({ name: 'drizzle', kind: 'drizzle (database)', evidence: drizzle });

  const commands: StackReport['commands'] = [];
  for (const { dir, pkg } of pkgs) {
    const scripts = (pkg.scripts ?? {}) as Record<string, unknown>;
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command === 'string' && SCRIPT_NAME.test(name)) commands.push({ name, command, package: dir });
    }
  }
  for (const target of ['dev', 'test', 'build', 'lint', 'e2e']) {
    const make = readText(join(root, 'Makefile'));
    if (make && new RegExp(`^${target}:`, 'm').test(make)) commands.push({ name: target, command: `make ${target}`, package: '.' });
  }

  const browser: StackReport['browser_tests'] = [];
  const pw = fileList.find((f) => /(^|\/)playwright\.config\.(ts|js|mjs|cjs)$/.test(f));
  if (pw || allDeps.has('@playwright/test')) browser.push({ tool: 'playwright', evidence: pw ?? 'package.json: @playwright/test' });
  const cy = fileList.find((f) => /(^|\/)cypress\.config\.(ts|js|mjs|cjs)$/.test(f));
  if (cy || allDeps.has('cypress')) browser.push({ tool: 'cypress', evidence: cy ?? 'package.json: cypress' });

  return { languages, package_managers: managers, services, commands, ci: ciWorkflows(root, fileList), browser_tests: browser };
}

// ── Env files ────────────────────────────────────────────────────────────────

export type EnvClass = 'local' | 'remote' | 'prod';

export interface EnvKey {
  name: string;
  class: EnvClass;
  empty: boolean;
  encrypted: boolean;
}

export interface EnvFile {
  file: string;
  /** `.env.example` and the like: names a developer must set, no real values. */
  example: boolean;
  /** dotenvx `.env.keys`: the private keys that decrypt the encrypted files. */
  dotenvx_keys: boolean;
  keys: EnvKey[];
}

export interface EnvReport {
  files: EnvFile[];
  /** Names an example file declares that no other env file in its folder sets. */
  example_only: Array<{ name: string; example: string }>;
  /** Value schemes seen (postgres, redis, …): which local services the env expects. No host, no value. */
  schemes: string[];
}

const ENV_FILE = /^\.env(\.[\w.-]+)?$|^\.dev\.vars$/;
const EXAMPLE_FILE = /\.(example|sample|template|dist|defaults)$/i;
const PROD_FILE = /(^|[.\-_])(prod|production|live)([.\-_]|$)/i;
const REMOTE_FILE = /(^|[.\-_])(staging|stage|preview|qa|uat|remote)([.\-_]|$)/i;
const PROD_KEY = /(^|_)(PROD|PRODUCTION|LIVE)(_|$)/;
const LIVE_VALUE = /\b(sk|rk|pk|whsec)_live_/;

/** NAME=VALUE pairs (comments, `export`, quotes handled). Values never leave this module. */
function parsePairs(text: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const stripped = line.replace(/^export\s+/, '');
    const eq = stripped.indexOf('=');
    if (eq <= 0) continue;
    const name = stripped.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) continue;
    let value = stripped.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    out.push({ name, value });
  }
  return out;
}

/** The class of one key: prod by file name, key name or a live-mode value; remote when the value is a URL on another host. */
export function classifyEnvKey(file: string, name: string, value: string): EnvClass {
  const base = basename(file);
  if (PROD_FILE.test(base) || PROD_KEY.test(name.toUpperCase()) || LIVE_VALUE.test(value)) return 'prod';
  if (REMOTE_FILE.test(base) || pointsAtRemote(value)) return 'remote';
  return 'local';
}

/**
 * Every env value of 6 characters or more, held in this process only: the
 * plan scrubs them from any other string it prints (a CI step or a script can
 * repeat a value).
 */
export function envValues(root: string, fileList: string[]): Set<string> {
  const values = new Set<string>();
  for (const file of fileList.filter((f) => ENV_FILE.test(basename(f)))) {
    for (const { value } of parsePairs(readText(join(root, file)) ?? '')) {
      // A mode word or a number is no secret, and scrubbing it would garble commands.
      if (value.length >= 6 && !/^(true|false|development|production|staging|preview|test|debug|info|warning|\d+)$/i.test(value)) values.add(value);
    }
  }
  return values;
}

/** A deep copy of `data` where every string that contains one of `values` has it replaced by `<env value>`. */
export function scrubValues<T>(data: T, values: Set<string>): T {
  if (values.size === 0) return data;
  const sorted = [...values].sort((a, b) => b.length - a.length);
  return JSON.parse(
    JSON.stringify(data, (_key, value: unknown) => {
      if (typeof value !== 'string') return value;
      let out = value;
      for (const secret of sorted) if (out.includes(secret)) out = out.split(secret).join('<env value>');
      return out;
    }),
  ) as T;
}

export function scanEnv(root: string, fileList: string[]): EnvReport {
  const files: EnvFile[] = [];
  const schemes = new Set<string>();
  for (const file of fileList.filter((f) => ENV_FILE.test(basename(f)))) {
    const text = readText(join(root, file));
    if (text === null) continue;
    const base = basename(file);
    const example = EXAMPLE_FILE.test(base);
    const keysFile = base === '.env.keys';
    const keys = parsePairs(text).map(({ name, value }) => {
      const scheme = value.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
      if (scheme && !example && !['http', 'https'].includes(scheme)) schemes.add(scheme.replace(/\+.*$/, ''));
      return {
        name,
        class: keysFile ? (PROD_KEY.test(name.toUpperCase()) ? 'prod' : 'local') : classifyEnvKey(file, name, value),
        empty: value === '',
        encrypted: value.startsWith('encrypted:'),
      } satisfies EnvKey;
    });
    files.push({ file, example, dotenvx_keys: keysFile, keys });
  }
  const exampleOnly: EnvReport['example_only'] = [];
  for (const ex of files.filter((f) => f.example)) {
    const dir = dirname(ex.file);
    const setHere = new Set(
      files
        .filter((f) => !f.example && !f.dotenvx_keys && dirname(f.file) === dir)
        .flatMap((f) => f.keys.filter((k) => !k.empty).map((k) => k.name)),
    );
    for (const key of ex.keys) if (!setHere.has(key.name)) exampleOnly.push({ name: key.name, example: ex.file });
  }
  return { files, example_only: exampleOnly, schemes: [...schemes].sort() };
}

// ── Integrations ─────────────────────────────────────────────────────────────

export interface Integration {
  name: string;
  evidence: string[];
}

interface Rule {
  name: string;
  deps?: RegExp;
  files?: RegExp;
  keys?: RegExp;
  /** Text in docs and templates (README, CONTRIBUTING, .github/*.md). */
  links?: RegExp;
}

const RULES: Rule[] = [
  { name: 'Sentry', deps: /^(@sentry\/|sentry-sdk$|raven$)/, files: /(^|\/)sentry\.[\w.-]*config\.(ts|js|mjs)$|(^|\/)\.sentryclirc$/, keys: /^(NEXT_PUBLIC_|VITE_)?SENTRY_/ },
  { name: 'Better Stack', deps: /^(@logtail\/|@betterstack\/|logtail$)/, keys: /^(BETTERSTACK|BETTER_STACK|LOGTAIL)_/ },
  { name: 'PostHog', deps: /^(posthog-js|posthog-node|posthog|posthog-react-native)$/, keys: /POSTHOG/ },
  { name: 'Google Analytics 4', deps: /^(react-ga4|@next\/third-parties|ga-4-react|vue-gtag)$/, keys: /(^|_)(GA|GA4|GTAG|GOOGLE_ANALYTICS)(_|$)|MEASUREMENT_ID/ },
  { name: 'Linear', deps: /^@linear\/sdk$/, keys: /^LINEAR_/, links: /linear\.app\// },
  { name: 'Jira', deps: /^(jira-client|jira\.js)$/, keys: /^JIRA_/, links: /[\w-]+\.atlassian\.net\/(browse|jira)/ },
  { name: 'Slack', deps: /^@slack\//, keys: /^SLACK_/ },
  { name: 'Stripe', deps: /^(stripe|@stripe\/)/, keys: /^(NEXT_PUBLIC_|VITE_)?STRIPE_/ },
  { name: 'Supabase', deps: /^@supabase\//, files: /^supabase\/config\.toml$/, keys: /^(NEXT_PUBLIC_|VITE_)?SUPABASE_/ },
  { name: 'Convex', deps: /^(convex|@convex-dev\/)/, files: /^convex\.json$|^convex\/schema\.ts$/, keys: /^(NEXT_PUBLIC_|VITE_)?CONVEX_/ },
  { name: 'Vercel', deps: /^@vercel\//, files: /(^|\/)vercel\.json$/, keys: /^VERCEL_/ },
  { name: 'Cloudflare', deps: /^(@cloudflare\/|wrangler$)/, files: /(^|\/)wrangler\.(toml|json|jsonc)$/, keys: /^(CLOUDFLARE|CF)_/ },
  { name: 'Plain', deps: /^@team-plain\//, keys: /^PLAIN_/ },
  { name: 'Intercom', deps: /^(@intercom\/|intercom-client$|react-use-intercom$)/, keys: /INTERCOM/ },
  { name: 'Zendesk', deps: /^(node-zendesk|zendesk)/, keys: /^ZENDESK_/ },
];

export function scanIntegrations(root: string, fileList: string[], repo: RepositoryReport, env: EnvReport): Integration[] {
  const pkgs = packageJsons(root, repo);
  const pyText = ['requirements.txt', 'pyproject.toml'].map((f) => (fileList.includes(f) ? readText(join(root, f)) ?? '' : '')).join('\n');
  const pyDeps = [...pyText.matchAll(/^\s*["']?([A-Za-z0-9_.-]+)/gm)].map((m) => m[1]!.toLowerCase());
  const docs = fileList.filter((f) => /^(README|CONTRIBUTING|AGENTS|CLAUDE)\.md$/i.test(f) || /^\.github\/.*\.md$/i.test(f));
  const out: Integration[] = [];
  for (const rule of RULES) {
    const evidence: string[] = [];
    if (rule.deps) {
      for (const { dir, pkg } of pkgs) {
        const hit = depsOf(pkg).find((dep) => rule.deps!.test(dep));
        if (hit) evidence.push(`${dir === '.' ? '' : `${dir}/`}package.json: ${hit}`);
      }
      const py = pyDeps.find((dep) => rule.deps!.test(dep));
      if (py) evidence.push(`python: ${py}`);
    }
    if (rule.files) for (const file of fileList.filter((f) => rule.files!.test(f)).slice(0, 3)) evidence.push(file);
    if (rule.keys) {
      for (const file of env.files) {
        const key = file.keys.find((k) => rule.keys!.test(k.name));
        if (key) evidence.push(`${file.file}: ${key.name}`);
      }
    }
    if (rule.links) for (const doc of docs) if (rule.links.test(readText(join(root, doc)) ?? '')) evidence.push(doc);
    if (evidence.length > 0) out.push({ name: rule.name, evidence: evidence.slice(0, 5) });
  }
  return out;
}

// ── Dev environment proposal ─────────────────────────────────────────────────

export interface DevEnvProposal {
  base_image: string;
  runtimes: string[];
  system_packages: string[];
  container_runtime: boolean;
  services: string[];
  commands: { install: string | null; dev: string | null; test: string | null; e2e: string | null; typecheck: string | null; lint: string | null };
}

export function proposeDevEnv(stack: StackReport, env: EnvReport): DevEnvProposal {
  const runtimes = stack.languages.map((l) => (l.version ? `${l.name} ${l.version}` : l.name));
  const pm = stack.package_managers[0]?.name ?? null;
  const run = (name: string) => {
    const hit = stack.commands.find((c) => c.package === '.' && (c.name === name || (name === 'typecheck' && c.name === 'type-check')));
    if (!hit) return null;
    return pm && ['pnpm', 'yarn', 'bun', 'npm'].includes(pm) ? `${pm === 'npm' ? 'npm run' : pm} ${hit.name}` : hit.command;
  };
  const install = pm === 'pnpm' ? 'pnpm install --frozen-lockfile' : pm === 'yarn' ? 'yarn install --frozen-lockfile' : pm === 'bun' ? 'bun install' : pm === 'npm' ? 'npm ci' : pm === 'uv' ? 'uv sync' : pm === 'poetry' ? 'poetry install' : pm === 'pip' ? 'pip install -r requirements.txt' : pm === 'go' ? 'go mod download' : pm === 'cargo' ? 'cargo fetch' : null;
  const compose = stack.services.filter((s) => s.kind.startsWith('docker-compose'));
  const services = [
    ...compose.map((s) => `${s.name} (${s.evidence})`),
    ...stack.services.filter((s) => !s.kind.startsWith('docker-compose')).map((s) => s.kind),
    ...env.schemes.filter((s) => ['postgres', 'postgresql', 'mysql', 'redis', 'mongodb', 'amqp'].includes(s)).map((s) => `${s} (an env value expects it)`),
  ];
  const system = ['git', 'gh', 'curl', 'ca-certificates'];
  if (stack.browser_tests.length > 0) system.push('playwright browsers (npx playwright install --with-deps chromium)');
  if (env.schemes.includes('postgres') || env.schemes.includes('postgresql')) system.push('postgresql-client');
  return {
    base_image: stack.languages.some((l) => l.name === 'python') && !stack.languages.some((l) => l.name === 'node') ? 'python:<version>-bookworm' : 'debian:bookworm-slim (+ runtimes via mise)',
    runtimes,
    system_packages: system,
    container_runtime: compose.length > 0 || stack.services.some((s) => s.kind.startsWith('supabase')),
    services,
    commands: { install, dev: run('dev') ?? run('start'), test: run('test'), e2e: run('e2e') ?? run('test:e2e'), typecheck: run('typecheck'), lint: run('lint') },
  };
}
