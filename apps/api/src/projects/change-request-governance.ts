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
import { ensureDiffBlobs } from './git/commits';
import { readManifestFromRepo } from './git/files';
import { ensureCommitTrees, GitOperationError, refreshMirror, runGit, runGitBuffer } from './git/mirror';
import type { GitBackedProject } from './git/types';
import { scanAddedLines, type SecretScan } from './secret-scan';

/** The largest patch the secret scan reads. Above it the change is not scanned. */
const SECRET_SCAN_MAX_PATCH_BYTES = 32 * 1024 * 1024;
/** The most commits the secret scan reads. A longer branch is not scanned. */
const SECRET_SCAN_MAX_COMMITS = 500;

export interface MergeClassification {
  /** The head commit every check read. The merge lands exactly this commit. */
  headSha: string;
  /** Manifest permissions the change needs; `[]` when it changes none of the governed sections. */
  required: string[];
  /** Every agent's grant before and after, for the non-escalation check (iam/agent-grant-ceiling.ts). */
  grantsBefore: Map<string, AgentGrant>;
  grantsAfter: Map<string, AgentGrant>;
  /** What the change adds that looks like a secret; null when the change is too large to scan. */
  secrets: SecretScan | null;
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
 * could not classify. The one exception is size: a change over the scan bounds
 * (commits, files, patch bytes) is merged unscanned (`secrets: null`), as the
 * push gate forwards a pack it cannot check.
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
  const headSha = (await runGit(['rev-parse', '--verify', `refs/heads/${cr.headRef}^{commit}`], repoPath, false)).stdout.trim();
  const mergeBase = await runGit(['merge-base', `refs/heads/${cr.baseRef}`, headSha], repoPath, false)
    .then((r) => r.stdout.trim() || null)
    .catch(() => null);
  const [before, after, secrets] = await Promise.all([
    readManifestFromRepo(project, candidates, mergeBase ?? cr.baseRef, { strictRef: true }),
    readManifestFromRepo(project, candidates, headSha, { strictRef: true }),
    addedSecrets(repoPath, cr.baseRef, headSha),
  ]);
  const baseText = before?.content ?? null;
  const headText = after?.content ?? null;
  return {
    headSha,
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
 * history: the branch has to be rewritten without it. Merge commits on the
 * branch are skipped (their changes came from the commits they join). Renames
 * are detected, so a file that only moves adds nothing.
 */
async function addedSecrets(repoPath: string, baseRef: string, headSha: string): Promise<SecretScan | null> {
  const range = `refs/heads/${baseRef}..${headSha}`;
  // A partial store holds commits only (object-store.ts). Each commit's diff
  // reads its tree and its parent's, then both versions of every file it
  // changes: fetch the trees, then the files in one request, bounded like the
  // change-request diff (DIFF_BLOB_FETCH_MAX_BYTES).
  const listed = await runGit(
    ['rev-list', '--no-merges', '--parents', `--max-count=${SECRET_SCAN_MAX_COMMITS + 1}`, range],
    repoPath,
    false,
  );
  const commits = listed.stdout.split('\n').filter(Boolean);
  if (commits.length > SECRET_SCAN_MAX_COMMITS) return null;
  if (commits.length === 0) return { findings: [], total: 0 };
  await ensureCommitTrees(repoPath, [...new Set(commits.flatMap((line) => line.split(' ')))]);
  if (!(await ensureDiffBlobs(repoPath, ['log', '--format=', '--no-merges'], [range]))) return null;
  try {
    const { stdout } = await runGitBuffer(
      ['-c', 'core.quotePath=false', 'log', '-p', '--no-merges', '--format=commit %H', '--no-color', '--no-ext-diff',
        '--no-textconv', '-M', '-U0', '--src-prefix=a/', '--dst-prefix=b/', range],
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
    if (error instanceof GitOperationError && error.outputTooLarge) return null;
    throw error;
  }
}
