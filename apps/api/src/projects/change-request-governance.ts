// What merging a change request lands on its base branch, classified before
// the merge runs:
//   - the manifest permissions the change needs. A change to `agents`,
//     `default_agent`, `triggers`, `connectors`, `policies` or `policy` needs
//     the permission its direct route asserts (`requiredManifestActions`), so
//     a merge cannot do what the merger could not do directly;
//   - the secrets its commits add (`secret-scan.ts`).
// Both read one head commit, and the merge lands that commit and no later one.

import type { AgentGrant } from '@kortix/db';
import { grantsOfManifestText } from './agents/grants';
import { requiredManifestActions } from './change-request-policy';
import { validateRef } from './git-ref';
import { DIFF_BLOB_FETCH_MAX_BYTES, ensureDiffBlobs } from './git/commits';
import { readManifestFromRepo } from './git/files';
import { wouldBeMergeCommit } from './git/merge';
import { ensureCommitTrees, GitOperationError, refreshMirror, runGit, runGitBuffer } from './git/mirror';
import type { GitBackedProject } from './git/types';
import { MAX_SECRET_FINDINGS, scanAddedLines, type SecretScan } from './secret-scan';

/** The largest patch the secret scan reads. Above it the change is not scanned. */
const SECRET_SCAN_MAX_PATCH_BYTES = 32 * 1024 * 1024;
/** The most commits the secret scan reads. A longer branch is not scanned. */
const SECRET_SCAN_MAX_COMMITS = 500;
/**
 * The most merge commits it reads. Each costs a merge base and up to three
 * blob prefetches, so this bounds the git processes one merge request spends.
 */
const SECRET_SCAN_MAX_MERGES = 20;

export interface MergeClassification {
  /** The head commit every check read. The merge lands exactly this commit. */
  headSha: string;
  /** The base commit the manifest check compared against. The merge goes onto exactly this commit. */
  baseSha: string;
  /** The commit whose manifest the merge makes authoritative: the would-be merge, or the head when it conflicts. */
  manifestRef: string;
  /** Manifest permissions the change needs; `[]` when it changes none of the governed sections. */
  required: string[];
  /** Every agent's grant before and after, for the non-escalation check (iam/agent-grant-ceiling.ts). */
  grantsBefore: Map<string, AgentGrant>;
  grantsAfter: Map<string, AgentGrant>;
  /** What the change's commits add that looks like a secret; `unscanned` when it could not read them all. */
  secrets: SecretScan;
}

/**
 * Classify what merging `cr` does.
 *
 * Both refs are proved current first: the head branch is usually pushed
 * seconds before the merge, often through another API replica, and each
 * replica's mirror serves refs up to KORTIX_GIT_REFRESH_INTERVAL_MS stale.
 * Reading a stale mirror made the head ref unresolvable (release gate GH-17,
 * v0.13.31).
 *
 * Throws when a side cannot be read. The caller refuses the merge with a
 * retryable 503 (`CR_GOVERNANCE_UNVERIFIED`): it never merges a change it
 * could not classify. A change over the secret scan's bounds comes back with
 * `secrets.unscanned` set, and the caller refuses it unless a person overrides.
 */
export async function classifyMerge(
  project: GitBackedProject,
  cr: { baseRef: string; headRef: string },
): Promise<MergeClassification> {
  validateRef(cr.baseRef);
  validateRef(cr.headRef);
  const { manifestCandidatePaths } = await import('@kortix/manifest-schema');
  const candidates = manifestCandidatePaths(project.manifestPath);
  // One ls-remote per ref when it has not moved; a fetch when it has or when
  // this mirror has never seen it.
  await refreshMirror(project, true, { freshRef: cr.headRef });
  const repoPath = await refreshMirror(project, true, { freshRef: cr.baseRef });
  const resolve = async (ref: string) =>
    (await runGit(['rev-parse', '--verify', `refs/heads/${ref}^{commit}`], repoPath, false)).stdout.trim();
  const [headSha, baseSha] = [await resolve(cr.headRef), await resolve(cr.baseRef)];
  // Compare the base tip with what the merge would land, not the change
  // request's own diff: a merge can also undo what the base changed since the
  // branch point. A merge that conflicts does not land; its own diff stands in.
  const landed = await wouldBeMergeCommit(project, repoPath, baseSha, headSha);
  const mergeBase = landed
    ? baseSha
    : await runGit(['merge-base', baseSha, headSha], repoPath, false)
        .then((r) => r.stdout.trim() || null)
        .catch(() => null);
  const manifestRef = landed ?? headSha;
  const [before, after, history, landing] = await Promise.all([
    readManifestFromRepo(project, candidates, mergeBase ?? baseSha, { strictRef: true }),
    readManifestFromRepo(project, candidates, manifestRef, { strictRef: true }),
    addedSecrets(repoPath, cr.baseRef, headSha),
    landed ? landedSecrets(repoPath, baseSha, landed) : Promise.resolve(null),
  ]);
  const secrets = landing ? combineScans(history, landing) : history;
  const baseText = before?.content ?? null;
  const headText = after?.content ?? null;
  return {
    headSha,
    baseSha,
    manifestRef,
    required: requiredManifestActions(baseText, headText),
    grantsBefore: grantsOfManifestText(baseText),
    grantsAfter: grantsOfManifestText(headText),
    secrets,
  };
}

/**
 * The secrets the commits new to `baseRef` add (`base..head`), commit by
 * commit. The merge carries every one of those commits onto the base branch,
 * so a key added in one commit and deleted in the next still lands in its
 * history: the branch has to be rewritten without it.
 *
 * Nothing the branch controls hides a line: a merge commit is read as what its
 * resolution adds over an automatic merge of its parents (`remerge`), a file
 * git would call binary or `-diff` is read as text, and a rename is detected so
 * a file that only moves adds nothing. What the scan cannot read — more than
 * `SECRET_SCAN_MAX_COMMITS` commits or `SECRET_SCAN_MAX_MERGES` merges, more
 * file content than the store fetches at once, a patch over
 * `SECRET_SCAN_MAX_PATCH_BYTES`, an octopus merge — comes back as `unscanned`,
 * never as clean.
 */
async function addedSecrets(repoPath: string, baseRef: string, headSha: string): Promise<SecretScan> {
  const range = `refs/heads/${baseRef}..${headSha}`;
  const unscanned = (reason: string): SecretScan => ({ findings: [], total: 0, unscanned: reason });
  const listed = await runGit(['rev-list', '--parents', `--max-count=${SECRET_SCAN_MAX_COMMITS + 1}`, range], repoPath, false);
  const commits = listed.stdout.split('\n').filter(Boolean).map((line) => line.split(' '));
  if (commits.length > SECRET_SCAN_MAX_COMMITS) return unscanned(`more than ${SECRET_SCAN_MAX_COMMITS} commits`);
  if (commits.length === 0) return { findings: [], total: 0 };
  if (commits.some((ids) => ids.length > 3)) return unscanned('an octopus merge');
  const merges = commits.filter((ids) => ids.length === 3) as Array<[string, string, string]>;
  if (merges.length > SECRET_SCAN_MAX_MERGES) return unscanned(`more than ${SECRET_SCAN_MAX_MERGES} merge commits`);
  // A partial store holds commits only (object-store.ts). Each commit's diff
  // reads its tree and its parents'; a merge's remerge also reads the merge
  // base of its parents. Fetch those trees, then both versions of every file
  // the diffs compare, bounded like the change-request diff (DIFF_BLOB_FETCH_MAX_BYTES).
  // One git process at a time: the scan's cost stays proportional to its bounds.
  const mergeBases: Array<string | null> = [];
  for (const [, first, second] of merges) {
    mergeBases.push(
      await runGit(['merge-base', first, second], repoPath, false).then((r) => r.stdout.trim() || null).catch(() => null),
    );
  }
  const trees = new Set([...commits.flat(), ...mergeBases.filter((id): id is string => id !== null)]);
  await ensureCommitTrees(repoPath, [...trees]);
  // One byte budget for every prefetch of this scan, so a branch of many
  // merges cannot pull many times the change-request diff bound.
  const pairs = merges.flatMap(([merge, first, second], index) => {
    const base = mergeBases[index];
    return [[first, merge], ...(base ? [[base, first], [base, second]] : [])];
  });
  const perFetchBytes = Math.floor(DIFF_BLOB_FETCH_MAX_BYTES / (1 + pairs.length));
  if (!(await ensureDiffBlobs(repoPath, ['log', '--format=', '--no-merges'], [range], perFetchBytes))) {
    return unscanned('more file content than one scan reads');
  }
  for (const pair of pairs) {
    if (!(await ensureDiffBlobs(repoPath, ['diff'], pair, perFetchBytes))) {
      return unscanned('more file content than one scan reads');
    }
  }
  try {
    const { stdout } = await runGitBuffer(
      ['-c', 'core.quotePath=false', 'log', '-p', '--diff-merges=remerge', '--text', '--format=commit %H',
        '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-U0', '--src-prefix=a/', '--dst-prefix=b/', range],
      repoPath,
      false,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      SECRET_SCAN_MAX_PATCH_BYTES,
    );
    return scanAddedLines(stdout.toString('utf8'));
  } catch (error) {
    if (error instanceof GitOperationError && error.outputTooLarge) {
      return unscanned(`a patch over ${SECRET_SCAN_MAX_PATCH_BYTES / (1024 * 1024)} MB`);
    }
    throw error;
  }
}

/**
 * The secrets the merge itself adds to the base tip (`git diff base landed`).
 * The commit scan reads what the branch's commits add; this reads what the
 * merge puts back, such as a key the base deleted that a conflict resolution
 * on the branch kept.
 */
async function landedSecrets(repoPath: string, baseSha: string, landed: string): Promise<SecretScan> {
  if (!(await ensureDiffBlobs(repoPath, ['diff'], [baseSha, landed]))) {
    return { findings: [], total: 0, unscanned: 'more file content than one scan reads' };
  }
  try {
    const { stdout } = await runGitBuffer(
      ['-c', 'core.quotePath=false', 'diff', '--text', '--no-color', '--no-ext-diff', '--no-textconv', '-M', '-U0',
        '--src-prefix=a/', '--dst-prefix=b/', baseSha, landed],
      repoPath,
      false,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      SECRET_SCAN_MAX_PATCH_BYTES,
    );
    return scanAddedLines(stdout.toString('utf8'));
  } catch (error) {
    if (error instanceof GitOperationError && error.outputTooLarge) {
      return { findings: [], total: 0, unscanned: `a patch over ${SECRET_SCAN_MAX_PATCH_BYTES / (1024 * 1024)} MB` };
    }
    throw error;
  }
}

/** Both scans; a landing finding a commit finding already names (same file and rule) is not counted twice. */
function combineScans(history: SecretScan, landing: SecretScan): SecretScan {
  const named = new Set(history.findings.map((f) => `${f.file}\0${f.rule}`));
  const extra = landing.findings.filter((f) => !named.has(`${f.file}\0${f.rule}`));
  const unscanned = history.unscanned ?? landing.unscanned;
  return {
    findings: [...history.findings, ...extra].slice(0, MAX_SECRET_FINDINGS),
    total: history.total + extra.length,
    ...(unscanned ? { unscanned } : {}),
  };
}
