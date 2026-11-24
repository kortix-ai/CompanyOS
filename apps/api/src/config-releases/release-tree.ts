/**
 * Config release tree plumbing.
 *
 * Pure git plumbing over the API's bare mirror: resolve a commit's tree, list
 * its files, compose the release tree (the commit's whole tree, minus the
 * files it leaves out) in a scratch repository, and build its `tar.gz`. No caches, no store, no governance: the release orchestration
 * lives in `builder.ts`, which re-exports this module's public names. It never
 * calls into a sandbox.
 *
 * The mirror is a partial object store: it holds commits, and trees and files
 * only once a read asks for them. The scratch repository reads the mirror
 * through alternates and cannot fetch, so every read here first makes its
 * objects present: the trees of the commit, the `.gitattributes` files, the
 * tool modules it parses, and the files an archive packs.
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { childProcessEnv } from '../config';
import { ensureCommitTrees, ensureStoreObjects, ensureTreeContents, execFileAsync, runGitCapture, spawn } from '../projects/git/mirror';
import type { GitBackedProject } from '../projects/git/types';
import { isObjectFetchTooLarge } from '../shared/over-limit-memo';
import { bumpBounded } from '../shared/ttl-memo';

/**
 * The release archive cap. A release is the repository's whole tree at the
 * commit (the company project: 248 files, 2.6 MB, 2026-10-05). The daemon's
 * `MAX_CONFIG_ARCHIVE_BYTES` must match.
 */
export const MAX_CONFIG_ARCHIVE_BYTES = 32 * 1024 * 1024;
/** Bound on the uncompressed tar, so a huge repository cannot exhaust memory before the cap trips. The daemon's `MAX_EXTRACTED_BYTES` must match. */
const MAX_CONFIG_TAR_BYTES = 128 * 1024 * 1024;

export const HEX40 = /^[0-9a-f]{40}$/;

/**
 * `project` compiles every agent. `agent:<name>` compiles one selected agent.
 * `none` compiles an EMPTY config (`{}`): the answer for a session with no
 * usable agent (config-releases/session-agent.ts). Its etag is non-null, so a
 * session whose agent the manifest dropped still gets a release ID and still
 * boots, instead of `release_id: null` and no config at all.
 * `meta` is the platform coordinator: the platform's own governance and no
 * config dir. Its box holds no project checkout and its image has no `bun`,
 * so a project config dir with tool dependencies can never load there.
 */
export type ConfigReleaseVariant = 'project' | 'none' | 'mykortix' | `agent:${string}` | `repo-agent:${string}`;

/**
 * The agent of a one-agent variant, or null. `agent:<name>` is the release of
 * a session without repository access (`exact` file list). `repo-agent:<name>`
 * is the per-agent release of a session with repository access (`folders`
 * file list): built, not yet assigned to any session
 * (`.agents/skills/learnings/work/per-agent-config-release/`).
 */
export function variantAgent(variant: ConfigReleaseVariant): string | null {
  if (variant.startsWith('agent:')) return variant.slice('agent:'.length);
  if (variant.startsWith('repo-agent:')) return variant.slice('repo-agent:'.length);
  return null;
}

/** One tracked file: `[path relative to the repository root, git mode, blob ID]`. */
export type ConfigReleaseFile = [path: string, mode: string, blob: string];

export class ConfigArchiveTooLargeError extends Error {
  constructor(
    readonly limit: number,
    /** The size that tripped a cap, when one was measured. */
    readonly actualBytes?: number,
  ) {
    super(`config archive exceeds ${limit} bytes`);
    this.name = 'ConfigArchiveTooLargeError';
  }
}

/**
 * The bound on the files an archive downloads into the mirror: the tar bound,
 * scaled with the archive cap (128 MiB for 32 MiB) so a test's smaller cap
 * needs no 128 MiB fixture. A pack is compressed and a tar is not, so a
 * download over this bound means a tar over `MAX_CONFIG_TAR_BYTES`.
 */
function archiveFetchLimit(limit: number): number {
  return Math.min(MAX_CONFIG_TAR_BYTES, limit * 4);
}

/**
 * Run `fetch` (an `ensure*` call bounded by `maxBytes`) before an archive.
 * A download over the bound keeps nothing and means the archive is too large.
 */
async function ensureArchiveObjects(limit: number, fetch: (maxBytes: number) => Promise<unknown>): Promise<void> {
  try {
    await fetch(archiveFetchLimit(limit));
  } catch (error) {
    if (isObjectFetchTooLarge(error)) throw new ConfigArchiveTooLargeError(limit, error.receivedBytes);
    throw error;
  }
}

/**
 * The root tree ID of `commit`, or null. Every tree of the commit is present
 * in the mirror afterwards, and no file: what `ls-tree -r` and `read-tree`
 * read. The ID comes from the commit object, because `rev-parse
 * <commit>^{tree}` fails while the tree has not arrived.
 */
export async function commitRootTree(mirror: string, commit: string): Promise<string | null> {
  await ensureCommitTrees(mirror, [commit]);
  const result = await runGitCapture(['log', '--no-walk', '--format=%T', commit, '--'], mirror);
  const tree = result.stdout.trim();
  if (result.exitCode !== 0 || !HEX40.test(tree)) return null;
  return (await isTreeObject(mirror, tree)) ? tree : null;
}

/** Is `treeId` a tree object in the mirror? */
export async function isTreeObject(mirror: string, treeId: string): Promise<boolean> {
  if (!HEX40.test(treeId)) return false;
  const result = await runGitCapture(['cat-file', '-t', treeId], mirror);
  return result.exitCode === 0 && result.stdout.trim() === 'tree';
}

/**
 * `git ls-tree -r -z <tree>`: every file with its mode and blob ID. A tree
 * entry of type `commit` (a submodule) is skipped. Symlinks keep mode 120000.
 */
export async function listConfigFiles(
  mirror: string,
  treeId: string,
  env?: Record<string, string>,
): Promise<ConfigReleaseFile[]> {
  const result = await runGitCapture(['ls-tree', '-r', '-z', treeId], mirror, null, env);
  if (result.exitCode !== 0) {
    throw new Error(`git ls-tree ${treeId} failed: ${result.stderr.trim()}`);
  }
  const files: ConfigReleaseFile[] = [];
  for (const record of result.stdout.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode, type, blob] = record.slice(0, tab).split(' ');
    const path = record.slice(tab + 1);
    if (type !== 'blob' || !mode || !blob || !path) continue;
    files.push([path, mode, blob]);
  }
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return files;
}

const ARCHIVE_IDENTITY = {
  GIT_AUTHOR_NAME: 'Kortix config release',
  GIT_AUTHOR_EMAIL: 'config-release@kortix.invalid',
  GIT_AUTHOR_DATE: '@0 +0000',
  GIT_COMMITTER_NAME: 'Kortix config release',
  GIT_COMMITTER_EMAIL: 'config-release@kortix.invalid',
  GIT_COMMITTER_DATE: '@0 +0000',
};

/**
 * A scratch bare repository that reads the mirror's objects through
 * `GIT_ALTERNATE_OBJECT_DIRECTORIES`. Two reasons:
 * - `info/attributes` neutralises `export-ignore` and `export-subst`. Without
 *   it a `.gitattributes` in the config dir drops or rewrites files, and blob
 *   verification on the box fails.
 * - The fixed-date wrapper commit is written here, so the mirror receives no
 *   writes.
 */
async function withScratchRepo<T>(mirror: string, fn: (repo: string, env: Record<string, string>) => Promise<T>): Promise<T> {
  const repo = await mkdtemp(join(tmpdir(), 'kortix-config-archive-'));
  try {
    const init = await runGitCapture(['init', '--quiet', '--bare', repo], tmpdir());
    if (init.exitCode !== 0) throw new Error(`git init scratch repo failed: ${init.stderr.trim()}`);
    await mkdir(join(repo, 'info'), { recursive: true });
    await writeFile(join(repo, 'info', 'attributes'), '* -export-ignore -export-subst\n');
    // The mirror is bare, so this is `<mirror>/objects`; asking git also
    // covers a non-bare repository.
    const objects = await runGitCapture(['rev-parse', '--git-path', 'objects'], mirror);
    if (objects.exitCode !== 0) throw new Error(`git rev-parse --git-path objects failed: ${objects.stderr.trim()}`);
    const env = { GIT_ALTERNATE_OBJECT_DIRECTORIES: resolve(mirror, objects.stdout.trim()), ...ARCHIVE_IDENTITY };
    return await fn(repo, env);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

/**
 * Build the `tar.gz` of a config tree: `git archive --format=tar` of a
 * fixed-date commit that wraps the tree, piped through `gzip -n`. `git archive`
 * of a bare tree stamps the current time; the wrapper commit carries mtime 0,
 * so two builds of one tree give identical bytes. Paths are relative to the
 * config dir root. Throws `ConfigArchiveTooLargeError` above `limit` bytes.
 */
export async function buildConfigArchive(
  mirror: string,
  treeId: string,
  limit = MAX_CONFIG_ARCHIVE_BYTES,
): Promise<Buffer> {
  if (!HEX40.test(treeId)) throw new Error(`invalid config tree id: ${treeId}`);
  await ensureArchiveObjects(limit, (maxBytes) => ensureTreeContents(mirror, treeId, { maxBytes }));
  return withScratchRepo(mirror, (repo, env) => archiveTree(repo, env, treeId, limit));
}

async function archiveTree(
  repo: string,
  env: Record<string, string>,
  treeId: string,
  limit: number,
): Promise<Buffer> {
  const wrapped = await runGitCapture(['commit-tree', treeId, '-m', 'config'], repo, null, env);
  const commit = wrapped.stdout.trim();
  if (wrapped.exitCode !== 0 || !HEX40.test(commit)) {
    throw new Error(`git commit-tree ${treeId} failed: ${wrapped.stderr.trim()}`);
  }
  return archiveThroughGzip(repo, commit, env, limit);
}

/**
 * What a release ships: the commit's whole tree, the same files and folders a
 * checkout of the base branch holds in `/workspace`. Nothing is moved: a file a
 * config refers to by a relative path (`skills/`, a tool or extension module)
 * is where the repository put it. The daemon reads the agents from the
 * compiled set, never from a harness config folder.
 *
 * Left out: files `.gitattributes` marks `export-ignore`, and a leftover
 * OpenCode config file (`LEFTOVER_OPENCODE_CONFIGS`), which would make the
 * release look like one a harness reads.
 */
interface ReleaseTreeSource {
  /** The commit's root tree ID in the mirror. */
  rootTree: string;
  /** Files left out of the release. */
  exportIgnored: string[];
}

/** OpenCode config files of a retired project layout. A release never ships one. */
const LEFTOVER_OPENCODE_CONFIGS = ['harnesses/opencode', '.kortix/opencode'].flatMap((dir) =>
  ['opencode.jsonc', 'opencode.json'].map((name) => `${dir}/${name}`),
);

/**
 * Is the release tree composed, rather than the commit's own tree? A composed
 * tree exists in no mirror: its archive URL carries the commit, and the
 * archive route rebuilds it from there.
 */
export function isComposedSource(source: ReleaseTreeSource): boolean {
  return source.exportIgnored.length > 0;
}

/** `git <args>` in `repo` with NUL-terminated `records` on stdin. Throws on a non-zero exit. */
async function gitWithInput(
  repo: string,
  env: Record<string, string>,
  args: string[],
  records: string[],
): Promise<string> {
  return (await gitStdin(repo, env, args, records.map((record) => `${record}\0`).join(''))).toString('utf8');
}

/** `git <args>` in `repo` with `input` on stdin; its stdout bytes. Throws on a non-zero exit. */
async function gitStdin(repo: string, env: Record<string, string>, args: string[], input: string): Promise<Buffer> {
  const child = spawn('git', args, {
    cwd: repo,
    // It may read the mirror (alternates), which must never fetch on its own.
    env: childProcessEnv({ GIT_TERMINAL_PROMPT: '0', ...env, GIT_NO_LAZY_FETCH: '1' }),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const exit = new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', resolveExit);
  });
  child.stdin.end(input);
  if ((await exit) !== 0) {
    throw new Error(`git ${args[0]} failed: ${Buffer.concat(stderr).toString('utf8').trim()}`);
  }
  return Buffer.concat(stdout);
}

/**
 * The bytes of each blob of `blobs` the mirror holds, in one `git cat-file
 * --batch`: one process for a whole round, not one per file. A missing blob,
 * or one over `maxBytes`, is absent from the result.
 */
async function readBlobs(mirror: string, blobs: readonly string[], maxBytes = Number.POSITIVE_INFINITY): Promise<Map<string, Buffer>> {
  const wanted = [...new Set(blobs)].filter((blob) => HEX40.test(blob));
  const out = new Map<string, Buffer>();
  if (wanted.length === 0) return out;
  const raw = await gitStdin(mirror, {}, ['cat-file', '--batch'], `${wanted.join('\n')}\n`);
  let at = 0;
  while (at < raw.length) {
    const eol = raw.indexOf(0x0a, at);
    if (eol < 0) break;
    const [oid, type, size] = raw.subarray(at, eol).toString('utf8').split(' ');
    at = eol + 1;
    if (type === 'missing' || size === undefined) continue;
    const bytes = Number(size);
    if (type === 'blob' && bytes <= maxBytes) out.set(oid!, raw.subarray(at, at + bytes));
    at += bytes + 1;
  }
  return out;
}

/** `tree` without `paths`, through a throwaway index in `repo`. */
async function pruneTree(repo: string, env: Record<string, string>, tree: string, paths: string[]): Promise<string> {
  const indexEnv = { ...env, GIT_INDEX_FILE: join(repo, 'release.index') };
  const read = await runGitCapture(['read-tree', tree], repo, null, indexEnv);
  if (read.exitCode !== 0) throw new Error(`git read-tree ${tree} failed: ${read.stderr.trim()}`);
  // Mode 0 removes the entry. `--index-info` needs no work tree; `--force-remove` does.
  await gitWithInput(repo, indexEnv, ['update-index', '-z', '--index-info'], paths.map((path) => `0 ${'0'.repeat(40)}\t${path}`));
  // The tree ID needs the entries, not the files: the mirror may not hold them yet.
  const written = await runGitCapture(['write-tree', '--missing-ok'], repo, null, indexEnv);
  const pruned = written.stdout.trim();
  if (written.exitCode !== 0 || !HEX40.test(pruned)) throw new Error(`git write-tree failed: ${written.stderr.trim()}`);
  return pruned;
}

/**
 * The release tree ID of `source`, written into `repo` (a scratch repository
 * that reads the mirror through alternates). With nothing left out it is the
 * commit's own root tree.
 */
async function composeReleaseTree(
  repo: string,
  env: Record<string, string>,
  source: ReleaseTreeSource,
): Promise<string> {
  if (source.exportIgnored.length === 0) return source.rootTree;
  return pruneTree(repo, env, source.rootTree, source.exportIgnored);
}

/**
 * The files of `rootTree` its `.gitattributes` marks `export-ignore`, on the
 * file or on one of its directories: what a plain `git archive` leaves out
 * (KRTX-1728). Paths `exempt` keeps are never listed.
 *
 * Read from a throwaway index (`check-attr --cached`), in a scratch repository
 * WITHOUT the archive's neutralising `info/attributes`. `check-attr --source`
 * would need git 2.40; the API image runs 2.39.
 */
async function exportIgnoredPaths(
  mirror: string,
  rootTree: string,
  exempt: (path: string) => boolean,
): Promise<string[]> {
  const files = await listConfigFiles(mirror, rootTree);
  const attributeFiles = files.filter(([path]) => path === '.gitattributes' || path.endsWith('/.gitattributes'));
  // The attribute files are read here and by `check-attr` below.
  await ensureStoreObjects(mirror, attributeFiles.map(([, , blob]) => blob));
  // The common case is no rule at all: no index, no scratch repository.
  let named = false;
  for (const [, , blob] of attributeFiles) {
    const text = await runGitCapture(['cat-file', 'blob', blob], mirror);
    if (text.exitCode === 0 && text.stdout.includes('export-ignore')) named = true;
  }
  if (!named) return [];

  const candidates = files.map(([path]) => path).filter((path) => !exempt(path));
  const ancestors = (path: string) => path.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'));
  const queried = [...new Set(candidates.flatMap((path) => [...ancestors(path), path]))];
  const repo = await mkdtemp(join(tmpdir(), 'kortix-config-attributes-'));
  try {
    const init = await runGitCapture(['init', '--quiet', '--bare', repo], tmpdir());
    if (init.exitCode !== 0) throw new Error(`git init scratch repo failed: ${init.stderr.trim()}`);
    const objects = await runGitCapture(['rev-parse', '--git-path', 'objects'], mirror);
    if (objects.exitCode !== 0) throw new Error(`git rev-parse --git-path objects failed: ${objects.stderr.trim()}`);
    const env = {
      GIT_ALTERNATE_OBJECT_DIRECTORIES: resolve(mirror, objects.stdout.trim()),
      GIT_INDEX_FILE: join(repo, 'attributes.index'),
    };
    const read = await runGitCapture(['read-tree', rootTree], repo, null, env);
    if (read.exitCode !== 0) throw new Error(`git read-tree ${rootTree} failed: ${read.stderr.trim()}`);
    // `-z` output: path NUL attribute NUL value NUL, per queried path.
    const out = (await gitWithInput(repo, env, ['check-attr', '--cached', '-z', '--stdin', 'export-ignore'], queried)).split('\0');
    const ignored = new Set<string>();
    for (let i = 0; i + 2 < out.length; i += 3) if (out[i + 2] === 'set') ignored.add(out[i]!);
    return candidates.filter((path) => ignored.has(path) || ancestors(path).some((dir) => ignored.has(dir)));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
}

/** Compose the release tree of `source` in a scratch repository and read it there.
 *
 * `archive` builds the `tar.gz` too: a boolean, or a predicate over the
 * composed tree ID for callers that decide from the tree ID (the builder
 * skips the build when the archive size is already cached).
 */
export async function readComposedRelease(
  mirror: string,
  source: ReleaseTreeSource,
  options: { archive: boolean | ((treeId: string) => boolean); limit?: number },
): Promise<{ treeId: string; files: ConfigReleaseFile[]; archive: Buffer | null }> {
  return withScratchRepo(mirror, async (repo, env) => {
    const treeId = await composeReleaseTree(repo, env, source);
    const files = await listConfigFiles(repo, treeId, env);
    const wanted = typeof options.archive === 'function' ? options.archive(treeId) : options.archive;
    if (!wanted) return { treeId, files, archive: null };
    const limit = options.limit ?? MAX_CONFIG_ARCHIVE_BYTES;
    // Exactly the files that ship: an `export-ignore` path is never downloaded.
    await ensureArchiveObjects(limit, (maxBytes) => ensureStoreObjects(mirror, files.map(([, , blob]) => blob), { maxBytes }));
    return { treeId, files, archive: await archiveTree(repo, env, treeId, limit) };
  });
}

/** A tree of exactly `files`, written in a scratch repository, and its `tar.gz` when `archive` asks for one. */
export async function readFileTree(
  mirror: string,
  files: readonly ConfigReleaseFile[],
  options: { archive: boolean | ((treeId: string) => boolean); limit?: number },
): Promise<{ treeId: string; archive: Buffer | null }> {
  return withScratchRepo(mirror, async (repo, env) => {
    const indexEnv = { ...env, GIT_INDEX_FILE: join(repo, 'release.index') };
    await gitWithInput(repo, indexEnv, ['update-index', '-z', '--add', '--index-info'], files.map(([path, mode, blob]) => `${mode} ${blob}\t${path}`));
    // The tree ID needs the entries, not the files: the mirror may not hold them yet.
    const written = await runGitCapture(['write-tree', '--missing-ok'], repo, null, indexEnv);
    const treeId = written.stdout.trim();
    if (written.exitCode !== 0 || !HEX40.test(treeId)) throw new Error(`git write-tree failed: ${written.stderr.trim()}`);
    const wanted = typeof options.archive === 'function' ? options.archive(treeId) : options.archive;
    if (!wanted) return { treeId, archive: null };
    const limit = options.limit ?? MAX_CONFIG_ARCHIVE_BYTES;
    await ensureArchiveObjects(limit, (maxBytes) => ensureStoreObjects(mirror, files.map(([, , blob]) => blob), { maxBytes }));
    return { treeId, archive: await archiveTree(repo, env, treeId, limit) };
  });
}

/** What Bun tries, in order, for a relative import: the path, then each extension, then a directory index. */
const IMPORT_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

/** A file Bun parses for imports. */
const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

// replica-local: the import specifiers of a blob at a path; a blob never changes, so a miss only parses it again.
const parsedImports = new Map<string, string[]>();
// replica-local: the relative references of a skill text blob; a miss only reads it again.
const textReferences = new Map<string, string[]>();
const MAX_PARSED_IMPORTS = 20_000;

/** Every file of `rootTree`, by path. */
async function treeFiles(mirror: string, rootTree: string): Promise<Map<string, ConfigReleaseFile>> {
  return new Map((await listConfigFiles(mirror, rootTree)).map((file) => [file[0], file]));
}

/**
 * The files the modules `modules` load: each module and every file it imports
 * by a relative specifier, transitively, from `tree`. A package import is not
 * followed. A module that is not in the tree is left out, and the box reports
 * it as missing.
 */
async function importClosure(mirror: string, tree: ReadonlyMap<string, ConfigReleaseFile>, modules: readonly string[]): Promise<ConfigReleaseFile[]> {
  const found = new Map<string, ConfigReleaseFile>();
  let queue = [...modules];
  // One round per import depth: one download for the modules the round parses.
  while (queue.length > 0) {
    const round: ConfigReleaseFile[] = [];
    for (const path of queue) {
      const file = tree.get(path);
      if (!file || found.has(path)) continue;
      found.set(path, file);
      if (file[1] !== '120000' && !path.endsWith('.json')) round.push(file);
    }
    queue = [];
    const unparsed = round.filter(([path, , blob]) => !parsedImports.has(`${blob}\0${path}`));
    await ensureStoreObjects(mirror, unparsed.map(([, , blob]) => blob));
    const sources = await readBlobs(mirror, unparsed.map(([, , blob]) => blob));
    for (const [path, , blob] of round) {
      const key = `${blob}\0${path}`;
      let imports = parsedImports.get(key);
      if (!imports) {
        const source = sources.get(blob);
        const loader = path.endsWith('.tsx') ? 'tsx' : path.endsWith('.jsx') ? 'jsx' : /\.[cm]?ts$/.test(path) ? 'ts' : 'js';
        imports = [];
        try {
          if (source) imports = new Bun.Transpiler({ loader }).scanImports(source.toString('utf8')).map((entry) => entry.path);
        } catch {
          // A syntax error: the box reports it when it imports the module.
        }
        if (source) bumpBounded(parsedImports, key, imports, MAX_PARSED_IMPORTS);
      }
      for (const specifier of imports) {
        if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
        const base = posix.normalize(posix.join(posix.dirname(path), specifier));
        // `./x.js` names `x.ts` in TypeScript, and Bun resolves it so.
        const candidates = [...IMPORT_SUFFIXES.map((suffix) => base + suffix), base.replace(/js$/, 'ts'), ...IMPORT_SUFFIXES.slice(1).map((suffix) => `${base}/index${suffix}`)];
        const target = candidates.find((candidate) => tree.has(candidate));
        if (target) queue.push(target);
      }
    }
  }
  return [...found.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * How much of the repository a one-agent file list takes around what the
 * agent names.
 *
 * - `exact`: a session WITHOUT repository access. The tool modules and the
 *   files they import, nothing beside them: a file the agent may not use is
 *   never disclosed.
 * - `folders`: a session WITH repository access, which holds the whole
 *   checkout in `/workspace` anyway. Whole folders around every tool file, and
 *   the package and compiler config above them, so a tool that reads a file
 *   next to itself at run time still finds it. #9197 replaced a release that
 *   dropped such files; this list must never drop a file the agent reads.
 */
export type AgentFileScope = 'exact' | 'folders';

export interface AgentFileListInput {
  /** Repo-relative modules of the project tools an agent of the set may call. */
  toolModules: readonly string[];
  /** Repo-relative folders of the registered skills an agent of the set may load. */
  skillFolders: readonly string[];
  /** Repo-relative sources of the local pi packages an agent of the set enables: a file or a folder. */
  packageSources: readonly string[];
  /** Files taken whenever the tree holds them (the root `AGENTS.md`, the manifest). */
  rootFiles: readonly string[];
  scope: AgentFileScope;
}

/** The config files a tool's module resolution reads, in its folder or any folder above it. */
const RESOLUTION_FILES = [
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
  'bunfig.toml',
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.npmrc',
];

/** The folder of a repo-relative path, with its trailing slash; `''` at the root. */
function folderOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut + 1);
}

/** `relative` resolved against the folder of `from`, or null when it leaves the repository or is not a path. */
function resolveRelative(from: string, relative: string): string | null {
  const clean = relative.split(/[?#]/)[0]!.trim();
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('/')) return null;
  const joined = posix.normalize(posix.join(folderOf(from), clean)).replace(/\/+$/, '');
  if (!joined || joined === '.' || joined === '..' || joined.startsWith('../')) return null;
  return joined;
}

/** Markdown link targets and quoted `./` / `../` paths in a text file. */
function relativeReferences(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push(match[1]!);
  for (const match of text.matchAll(/[`'"](\.\.?\/[^`'"\s]+)[`'"]/g)) out.push(match[1]!);
  return out;
}

/** A text file a skill may link from. Bounded so a huge file is never scanned. */
const SKILL_TEXT_FILE = /\.(?:md|mdx|txt)$/i;
const MAX_SCANNED_TEXT_BYTES = 1024 * 1024;

/**
 * The files one agent's release holds (see `AgentFileScope`), from the root
 * tree `rootTree`:
 *
 * - each of `rootFiles` the tree holds;
 * - every file under each skill folder, and under each package folder (a
 *   package that is one file is its folder, as the box reads it, except at
 *   the repository root);
 * - each tool module and every file it imports by a relative specifier;
 * - every path a skill's text files link to by a relative path (a file, or
 *   every file under a folder), as the model reads the skill from the release;
 * - `folders` only: every file under the folder of each tool file (never the
 *   repository root), the files those import, and the module-resolution
 *   config (`RESOLUTION_FILES`) in each folder from there up to the root.
 *
 * Paths never move: each file keeps the path the repository gives it.
 */
export async function agentReleaseFiles(mirror: string, rootTree: string, input: AgentFileListInput): Promise<ConfigReleaseFile[]> {
  const tree = await treeFiles(mirror, rootTree);
  const out = new Map<string, ConfigReleaseFile>();
  const take = (file: ConfigReleaseFile | undefined) => {
    if (file) out.set(file[0], file);
  };
  const underFolder = (folder: string) => {
    if (!folder) return;
    for (const [path, file] of tree) if (path.startsWith(folder)) take(file);
  };
  const folderOrFile = (path: string) => {
    if (tree.has(path)) take(tree.get(path));
    else underFolder(`${path}/`);
  };

  for (const path of input.rootFiles) take(tree.get(path));

  const skillPrefixes = input.skillFolders.flatMap((folder) => {
    const clean = posix.normalize(folder.trim()).replace(/^(\.\/)+/, '').replace(/\/+$/, '');
    return !clean || clean === '.' || clean.startsWith('../') || clean === '..' || clean.startsWith('/') ? [] : [`${clean}/`];
  });
  for (const prefix of skillPrefixes) underFolder(prefix);

  for (const source of input.packageSources) {
    const clean = resolveRelative('', source);
    if (!clean) continue;
    if (tree.has(clean) && /\.[cm]?[jt]sx?$/.test(clean)) {
      const folder = folderOf(clean);
      if (folder) underFolder(folder);
      else take(tree.get(clean));
    } else {
      folderOrFile(clean);
    }
  }

  // The links of every skill text file. The blobs ship anyway; a blob is read once per process.
  const texts = [...out.values()].filter(([path, mode]) => mode !== '120000' && SKILL_TEXT_FILE.test(path) && skillPrefixes.some((prefix) => path.startsWith(prefix)));
  const unread = texts.filter(([, , blob]) => !textReferences.has(blob)).map(([, , blob]) => blob);
  if (unread.length > 0) {
    await ensureStoreObjects(mirror, unread);
    const read = await readBlobs(mirror, unread, MAX_SCANNED_TEXT_BYTES);
    // A blob over the bound links nothing; one that did not arrive is asked again next time.
    for (const blob of unread) {
      const bytes = read.get(blob);
      if (bytes) bumpBounded(textReferences, blob, relativeReferences(bytes.toString('utf8')), MAX_PARSED_IMPORTS);
    }
  }
  for (const [path, , blob] of texts) {
    for (const reference of textReferences.get(blob) ?? []) {
      const target = resolveRelative(path, reference);
      if (target) folderOrFile(target);
    }
  }

  let tools = await importClosure(mirror, tree, input.toolModules);
  if (input.scope === 'folders' && tools.length > 0) {
    // To a fixed point: a file a folder brings in may import from another folder.
    const folders = new Set<string>();
    for (;;) {
      const next = tools.map(([path]) => folderOf(path)).filter((folder) => folder && !folders.has(folder));
      if (next.length === 0) break;
      for (const folder of next) folders.add(folder);
      const code = [...tree.keys()].filter((path) => CODE_FILE.test(path) && [...folders].some((folder) => path.startsWith(folder)));
      tools = await importClosure(mirror, tree, [...tools.map(([path]) => path), ...code]);
    }
    for (const folder of folders) underFolder(folder);
    for (const [path] of tools) {
      const parts = path.split('/').slice(0, -1);
      for (let depth = parts.length; depth >= 0; depth -= 1) {
        const dir = parts.slice(0, depth).join('/');
        for (const name of RESOLUTION_FILES) take(tree.get(dir ? `${dir}/${name}` : name));
      }
    }
  }
  for (const file of tools) take(file);

  return [...out.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * The release tree source of `commit`. Shared by the builder and the archive
 * route, which rebuilds a composed tree from the commit in its path.
 */
export async function resolveReleaseTreeSource(
  mirror: string,
  project: Pick<GitBackedProject, 'manifestPath'>,
  commit: string,
): Promise<{ source: ReleaseTreeSource } | { reason: string }> {
  const rootTree = await commitRootTree(mirror, commit);
  if (!rootTree) return { reason: `commit ${commit} has no tree` };
  // The manifest's own `.gitattributes` entry must not drop it.
  const exportIgnored = await exportIgnoredPaths(mirror, rootTree, (path) => path === project.manifestPath);
  for (const path of LEFTOVER_OPENCODE_CONFIGS) {
    // Resolved from the tree alone: `cat-file -e` also needs the file, which
    // a partial mirror may not hold, and would answer "absent".
    const exists = await runGitCapture(['rev-parse', '--verify', '--quiet', `${commit}:${path}`], mirror);
    if (exists.exitCode === 0 && !exportIgnored.includes(path)) exportIgnored.push(path);
  }
  return { source: { rootTree, exportIgnored } };
}

/**
 * `git archive -o` to a file, then `gzip -n` on that file. Both write to disk:
 * piping one Bun child process into another truncated a 4 MiB archive to
 * 982,058 bytes with exit code 0 (measured 2026-09-21), the same failure class
 * `materializeRepoContext` avoids with a temporary tarball.
 */
async function archiveThroughGzip(
  repo: string,
  commit: string,
  env: Record<string, string>,
  limit: number,
): Promise<Buffer> {
  const tarPath = join(repo, 'config.tar');
  const archived = await runGitCapture(['archive', '--format=tar', '-o', tarPath, commit], repo, null, env);
  if (archived.exitCode !== 0) throw new Error(`git archive ${commit} failed: ${archived.stderr.trim()}`);
  const tarBytes = (await stat(tarPath)).size;
  if (tarBytes > MAX_CONFIG_TAR_BYTES) throw new ConfigArchiveTooLargeError(limit, tarBytes);
  try {
    await execFileAsync('gzip', ['-n', '-f', tarPath], { timeout: 60_000 });
  } catch (error) {
    throw new Error(`gzip -n failed: ${(error as Error).message}`);
  }
  // Read once and measure the bytes read: a stat followed by a read can see
  // two different files (CodeQL js/file-system-race).
  const gz = await readFile(`${tarPath}.gz`);
  if (gz.length > limit) throw new ConfigArchiveTooLargeError(limit, gz.length);
  return gz;
}
