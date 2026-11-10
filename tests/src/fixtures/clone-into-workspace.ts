/**
 * The shell command RUN-7 and GOLD-1 prepend to their write prompt.
 *
 * A session has no checkout at boot (#12136): `/workspace` starts empty, and
 * the host `commit-push` answers 409 "project repo is not materialized" until
 * a Git repository is there. An agent with `project.gitops.read` clones the
 * workspace repository itself. This command does it into `/workspace`, where
 * `commit-push` looks, and works when `/workspace` already holds files.
 *
 * Two rules, both from the boot clone (harness/shared/workspace-setup.ts):
 *   - a folder that already holds a repository is left as it is, so a checkout
 *     the box made on the session branch survives;
 *   - a fresh clone checks out the session branch when the remote has it, and
 *     the default branch otherwise.
 * Without them the clone replaced the session branch with the default branch,
 * and the host `commit-push` rejected the push as non-fast-forward (release
 * suite 42868914454, GOLD-1).
 */
export const CLONE_INTO_WORKSPACE_COMMAND =
  'git -C /workspace rev-parse --git-dir >/dev/null 2>&1 || ' +
  '{ d=$(mktemp -d) && git clone -q "$KORTIX_REPO_URL" "$d/repo" && cp -a "$d/repo/." /workspace/ && ' +
  '{ git -C /workspace checkout -q -B "$KORTIX_BRANCH_NAME" "origin/$KORTIX_BRANCH_NAME" 2>/dev/null || ' +
  'git -C /workspace checkout -q -B "$KORTIX_BRANCH_NAME"; }; }; ' +
  'git -C /workspace rev-parse HEAD';

/** The prompt prefix: the command, and the rule that it must succeed. */
export const CLONE_INTO_WORKSPACE = `First run this exact shell command with your shell tool: \`${CLONE_INTO_WORKSPACE_COMMAND}\`. It must exit 0. `;
