/**
 * Ask AI on an artifact: a new chat that starts with the artifact attached.
 * The viewer's `···` sheet attaches it (`stores/artifact-chat-store.ts`), and
 * project home shows it on the composer until the send or its X. Pure: no
 * React or React Native imports (unit-tested under bun test).
 *
 * The wire is web's Ask AI sheet (apps/web features/artifacts/ask-agent-sheet.tsx):
 * the first prompt is the person's words, then the artifact's Files path as a
 * `Referenced files` block, and the session carries the `artifact:<id>` label,
 * so web lists it in that artifact's Ask AI history. The agent reads the
 * artifact itself at its path, so it gets the current content, not a name.
 */

import type { Artifact } from '@kortix/sdk';
import { buildFileRefsBlock } from '@/lib/session/user-message';

/** The artifact a chat starts with, as its current read names it. */
export interface ArtifactChatContext {
  artifactId: string;
  /** Its shared path in Files: what the agent reads. */
  path: string;
  title: string;
}

/** The label every Ask AI session of an artifact carries (web's `artifactLabel`). */
export function artifactChatLabel(artifactId: string): string {
  return `artifact:${artifactId}`;
}

/** The first prompt: the person's words, then the artifact as a `Referenced files` block. */
export function artifactChatPrompt(text: string, artifact: Pick<ArtifactChatContext, 'path' | 'title'>): string {
  return `${text}\n\n${buildFileRefsBlock([{ path: artifact.path, name: artifact.title }])}`;
}

export type AttachedArtifactState =
  | { status: 'ready'; context: ArtifactChatContext }
  | { status: 'loading' }
  | { status: 'error' };

/**
 * Whether the attached artifact may ride a send. Only a successful read of
 * THIS artifact is ready. A failed read is an error even with an older read
 * cached (access may be gone): the send is refused, never sent without it.
 */
export function attachedArtifactState(
  artifactId: string,
  read: { data: Pick<Artifact, 'artifact_id' | 'path' | 'title'> | undefined; isError: boolean },
): AttachedArtifactState {
  if (read.isError) return { status: 'error' };
  if (!read.data || read.data.artifact_id !== artifactId) return { status: 'loading' };
  return { status: 'ready', context: { artifactId, path: read.data.path, title: read.data.title } };
}
