/**
 * Where task files are read from.
 *
 *   repo: a path in the project repository, at the job's commit.
 *   git:  a path in a public git repository at a pinned commit. A dataset of the
 *         Harbor registry (`terminal-bench@2.0`) is a list of these.
 *
 * A git source is fetched once per (url, commit) into a bare repository under
 * the temp dir of the process (`fetch --depth 1`), then read with `ls-tree`
 * and `cat-file`. Each process keeps its own copy; a missing one is fetched again.
 */
import { createHash } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVAL_LIMITS, type EvalTaskSource } from '@kortix/api-contract';
import { ttlMemo } from '../../shared/ttl-memo';
import { listRepoFiles, readRepoFileBytes, type GitBackedProject } from '../git';
import { runGit, runGitBuffer } from '../git/mirror';
import { HarborTaskError, parseHarborTask, taskNameMatches, type HarborTask } from './harbor-task';
import { EvalTrialError } from './scoring';

/** Stored on a trial (`eval_trials.task_ref`): where its task is. */
export type EvalTaskRef =
  | { kind: 'repo'; path: string }
  | { kind: 'git'; git_url: string; commit: string; path: string };

export const taskRefLabel = (ref: EvalTaskRef): string =>
  ref.kind === 'repo' ? ref.path : `${ref.git_url.replace(/^https:\/\//, '').replace(/\.git$/, '')}@${ref.commit.slice(0, 7)}:${ref.path}`;

export interface TaskFile {
  /** Path relative to the folder that was read. */
  path: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Reads the files of one tree: the project repository at a commit, or a fetched git repository. */
export interface TaskTree {
  /** Every file path under `path` (all files when empty). */
  list(path: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array<ArrayBuffer>>;
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const under = (path: string, folder: string) => !folder || path === folder || path.startsWith(`${folder}/`);

export function projectTree(project: GitBackedProject, commit: string): TaskTree {
  return {
    async list(path) {
      return (await listRepoFiles(project, commit, path || null)).map((entry) => entry.path);
    },
    async read(path) {
      const bytes = await readRepoFileBytes(project, path, commit);
      return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    },
  };
}

// ── Public git repositories ──────────────────────────────────────────────────

/** Hosts a registry dataset may live on. Fetches carry no credential. */
const GIT_HOSTS = new Set(['github.com', 'gitlab.com', 'huggingface.co']);
const GIT_FETCH_TIMEOUT_MS = 5 * 60_000;

function checkedGitUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EvalTrialError('TaskLoadError', `Not a git URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' || !GIT_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new EvalTrialError('TaskLoadError', `Tasks are read only from public https repositories on ${[...GIT_HOSTS].join(', ')}: ${url}`);
  }
  return parsed.toString();
}

const checkedCommit = (commit: string): string => {
  if (!/^[0-9a-f]{40}$/i.test(commit)) throw new EvalTrialError('TaskLoadError', `Not a full commit SHA: ${commit}`);
  return commit.toLowerCase();
};

// replica-local: in-flight fetches of this process, so two trials of one dataset share one `git fetch`.
const fetching = new Map<string, Promise<string>>();

async function fetchedRepo(gitUrl: string, commit: string): Promise<string> {
  const url = checkedGitUrl(gitUrl);
  const sha = checkedCommit(commit);
  const dir = join(tmpdir(), 'kortix-evals-git', createHash('sha256').update(`${url}\n${sha}`).digest('hex').slice(0, 32));
  const ready = join(dir, 'kortix-fetched');
  if (await stat(ready).then(() => true, () => false)) return dir;
  const inFlight = fetching.get(dir);
  if (inFlight) return inFlight;
  const run = (async () => {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    try {
      await runGit(['init', '--bare', '--quiet'], dir, false);
      await runGit(['fetch', '--quiet', '--depth', '1', url, sha], dir, false, null, undefined, 'github.com', GIT_FETCH_TIMEOUT_MS);
      await Bun.write(ready, sha);
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw new EvalTrialError('TaskLoadError', `Could not fetch ${url} at ${sha.slice(0, 7)}: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
    }
    return dir;
  })().finally(() => fetching.delete(dir));
  fetching.set(dir, run);
  return run;
}

export function gitTree(gitUrl: string, commit: string): TaskTree {
  const sha = checkedCommit(commit);
  return {
    async list(path) {
      const dir = await fetchedRepo(gitUrl, sha);
      const args = ['ls-tree', '-r', '-z', '--name-only', sha, '--'];
      if (path) args.push(path);
      const { stdout } = await runGit(args, dir, false);
      return stdout.split('\0').filter(Boolean);
    },
    async read(path) {
      const dir = await fetchedRepo(gitUrl, sha);
      const { stdout } = await runGitBuffer(['cat-file', 'blob', `${sha}:${path}`], dir, false, null, undefined, 'github.com', 60_000, undefined, EVAL_LIMITS.task_folder_bytes_max * 2);
      return new Uint8Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength) as ArrayBuffer);
    },
  };
}

export const treeFor = (project: GitBackedProject, commit: string, ref: EvalTaskRef): TaskTree =>
  ref.kind === 'repo' ? projectTree(project, commit) : gitTree(ref.git_url, ref.commit);

// ── Tasks ────────────────────────────────────────────────────────────────────

async function readOptional(tree: TaskTree, paths: readonly string[], path: string): Promise<string | null> {
  return paths.includes(path) ? text(await tree.read(path)) : null;
}

/** Parse the task at `folder` of a tree whose file list is `paths`. */
async function loadTaskAt(tree: TaskTree, paths: readonly string[], folder: string): Promise<HarborTask> {
  const prefix = folder ? `${folder}/` : '';
  const inFolder = paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
  return parseHarborTask({
    folderName: folder.split('/').pop() || 'task',
    taskToml: await readOptional(tree, paths, `${prefix}task.toml`),
    instruction: await readOptional(tree, paths, `${prefix}instruction.md`),
    dockerfile: await readOptional(tree, paths, `${prefix}environment/Dockerfile`),
    paths: inFolder,
  });
}

/** The task a trial runs, read again at run time. */
export async function loadTask(tree: TaskTree, ref: EvalTaskRef): Promise<HarborTask> {
  try {
    return await loadTaskAt(tree, await tree.list(ref.path), ref.path);
  } catch (err) {
    if (err instanceof EvalTrialError) throw err;
    throw new EvalTrialError('TaskLoadError', err instanceof Error ? err.message : String(err));
  }
}

/** The files of one folder of a task (`tests`, `solution`), within the size limit. */
export async function loadTaskFolder(tree: TaskTree, ref: EvalTaskRef, folder: 'tests' | 'solution'): Promise<TaskFile[]> {
  const root = `${ref.path ? `${ref.path}/` : ''}${folder}`;
  const paths = (await tree.list(root)).filter((path) => under(path, root));
  const files: TaskFile[] = [];
  let total = 0;
  for (const path of paths) {
    const bytes = await tree.read(path);
    total += bytes.byteLength;
    if (total > EVAL_LIMITS.task_folder_bytes_max) {
      throw new EvalTrialError('TaskLoadError', `${root} is larger than ${EVAL_LIMITS.task_folder_bytes_max / 1024 / 1024} MB.`);
    }
    files.push({ path: path.slice(root.length + 1), bytes });
  }
  return files;
}

export interface DiscoveredTask {
  ref: EvalTaskRef;
  task: HarborTask | null;
  /** Why the folder is not a task, when `task` is null. */
  error: string | null;
}

/**
 * The tasks under a path of a tree: the path itself when it holds `task.toml`,
 * else every folder below it that does (a task inside another task is skipped).
 */
export async function discoverTasks(
  tree: TaskTree,
  path: string,
  toRef: (taskPath: string) => EvalTaskRef,
): Promise<DiscoveredTask[]> {
  const root = path.replace(/^\.?\/+|\/+$/g, '');
  const paths = (await tree.list(root)).filter((file) => under(file, root));
  const folders = paths
    .filter((file) => file === 'task.toml' || file.endsWith('/task.toml'))
    .map((file) => file.slice(0, Math.max(0, file.length - '/task.toml'.length)))
    .sort();
  const top = folders.filter((folder) => !folders.some((other) => other !== folder && under(folder, other) && other.length < folder.length));
  const out: DiscoveredTask[] = [];
  for (const folder of top) {
    try {
      out.push({ ref: toRef(folder), task: await loadTaskAt(tree, paths, folder), error: null });
    } catch (err) {
      if (!(err instanceof HarborTaskError)) throw err;
      out.push({ ref: toRef(folder), task: null, error: err.message });
    }
  }
  return out;
}

/** Apply a source's `task_names`, `exclude_task_names` and `n_tasks`, in name order. */
export function filterTasks(tasks: DiscoveredTask[], source: Pick<EvalTaskSource, 'task_names' | 'exclude_task_names' | 'n_tasks'>): DiscoveredTask[] {
  const nameOf = (entry: DiscoveredTask) => entry.task?.name ?? entry.ref.path.split('/').pop() ?? entry.ref.path;
  let kept = [...tasks].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  if (source.task_names?.length) kept = kept.filter((entry) => source.task_names!.some((pattern) => taskNameMatches(nameOf(entry), pattern)));
  if (source.exclude_task_names?.length) kept = kept.filter((entry) => !source.exclude_task_names!.some((pattern) => taskNameMatches(nameOf(entry), pattern)));
  if (source.n_tasks) kept = kept.slice(0, source.n_tasks);
  return kept;
}

// ── The Harbor registry ──────────────────────────────────────────────────────

/** Harbor's dataset registry: dataset → tasks, each a git url, a commit and a path. */
const HARBOR_REGISTRY_URL = 'https://raw.githubusercontent.com/harbor-framework/harbor/main/registry.json';

interface RegistryDataset {
  name: string;
  version: string;
  description?: string;
  tasks: Array<{ name?: string; git_url?: string | null; git_commit_id?: string | null; path: string }>;
}

const loadRegistry = ttlMemo<[], RegistryDataset[]>({
  ttlMs: 10 * 60_000,
  keyFn: () => 'registry',
  loader: async () => {
    const res = await fetch(HARBOR_REGISTRY_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new EvalTrialError('TaskLoadError', `The Harbor registry answered ${res.status}.`);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new EvalTrialError('TaskLoadError', 'The Harbor registry is not a list of datasets.');
    return body as RegistryDataset[];
  },
});

export interface RegistryDatasetSummary {
  name: string;
  version: string;
  description: string;
  n_tasks: number;
}

export async function listRegistryDatasets(): Promise<RegistryDatasetSummary[]> {
  return (await loadRegistry()).map((dataset) => ({
    name: dataset.name,
    version: String(dataset.version),
    description: dataset.description ?? '',
    n_tasks: dataset.tasks.length,
  }));
}

/** The task refs of one registry dataset. No version: the last one the registry lists. */
export async function registryTaskRefs(name: string, version: string | null | undefined): Promise<Array<{ name: string; ref: EvalTaskRef }>> {
  const all = (await loadRegistry()).filter((dataset) => dataset.name === name);
  const dataset = version ? all.find((entry) => String(entry.version) === String(version)) : all[all.length - 1];
  if (!dataset) {
    const versions = all.map((entry) => entry.version).join(', ');
    throw new EvalTrialError('TaskLoadError', all.length ? `Dataset ${name} has no version ${version}. Versions: ${versions}.` : `The Harbor registry has no dataset named ${name}.`);
  }
  return dataset.tasks.map((task) => {
    if (!task.git_url || !task.git_commit_id) {
      throw new EvalTrialError('TaskLoadError', `Dataset ${name}: task ${task.name ?? task.path} names no git repository and commit.`);
    }
    return {
      name: task.name ?? task.path.split('/').pop() ?? task.path,
      ref: { kind: 'git' as const, git_url: checkedGitUrl(task.git_url), commit: checkedCommit(task.git_commit_id), path: task.path.replace(/^\.?\/+|\/+$/g, '') },
    };
  });
}
