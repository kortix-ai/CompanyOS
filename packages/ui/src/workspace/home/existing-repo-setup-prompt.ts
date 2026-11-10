import { setupPrompt } from '@kortix/shared/setup-guide';

/**
 * The prompt a person copies into their own coding agent (Claude Code, Codex,
 * Cursor) to set up a repository they linked to Kortix that has no agents.
 *
 * Kortix never writes to a linked repository. The person's agent follows the
 * served setup guide (`@kortix/shared/setup-guide`, https://kortix.com/setup.md)
 * and pushes `kortix.yaml` to the branch the workspace reads.
 */

export const EXISTING_REPO_DOCS_URL = 'https://kortix.com/docs/developers#set-up-an-existing-repository';

export function existingRepoSetupPrompt(input: {
  /** `owner/name`, or the clone URL when the name is unknown. */
  repository: string | null | undefined;
  /** The branch the project reads `kortix.yaml` from. */
  branch: string | null | undefined;
}): string {
  return setupPrompt({ repository: input.repository, branch: input.branch });
}

/** `owner/name` from a GitHub clone URL, else the URL without `.git`. */
export function repositoryLabel(repoUrl: string | null | undefined): string | null {
  if (!repoUrl) return null;
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(repoUrl.trim());
  return match?.[1] ?? repoUrl.trim().replace(/\.git$/, '');
}
