/**
 * The artifact project home's next chat starts with (Ask AI,
 * `lib/artifacts/artifact-chat.ts`). The artifact `···` sheet attaches it and
 * opens project home; home shows it on the composer, reads it again, and sends
 * it with the first prompt. The X on it, a send, or leaving home clears it.
 *
 * Holds ids and a title only: home reads the artifact itself, so the path it
 * sends is the current one and a failed read is seen before the send.
 */

import type { Artifact } from '@kortix/sdk';
import { create } from 'zustand';

interface AttachedArtifact {
  projectId: string;
  artifactId: string;
  /** Shown on the composer until the read lands. */
  title: string;
}

interface ArtifactChatState {
  attached: AttachedArtifact | null;
  attach: (projectId: string, artifact: Pick<Artifact, 'artifact_id' | 'title'>) => void;
  /** Clears the attachment of this project only; another project's stays. */
  clear: (projectId: string) => void;
}

export const useArtifactChatStore = create<ArtifactChatState>()((set) => ({
  attached: null,
  attach: (projectId, artifact) =>
    set({ attached: { projectId, artifactId: artifact.artifact_id, title: artifact.title } }),
  clear: (projectId) => set((s) => (s.attached?.projectId === projectId ? { attached: null } : s)),
}));
