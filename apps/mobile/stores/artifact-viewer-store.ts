/**
 * Which artifact the viewer sheet shows (`ArtifactViewerSheet`, mounted once
 * in the project screen). The Artifacts page rows and a session's `show` rows
 * and message links all open HERE, so the page or the thread stays mounted
 * underneath and the sheet's X returns to the same place.
 *
 * `projectId` is the project whose viewer is mounted: a link opens here only
 * when it names an artifact of that project (`openArtifactLink`).
 *
 * Holds ids and a title only, never the signed `view_url`: the sheet reads the
 * artifact itself, so a reopened artifact always gets a fresh URL.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { z } from 'zod';

const savedViewers = z.object({
  byUser: z.record(
    z.string(),
    z.object({
      projectId: z.string().min(1),
      artifactId: z.string().min(1),
      title: z.string().optional(),
    })
  ),
});

export interface ArtifactViewerTarget {
  projectId: string;
  artifactId: string;
  /** Shown in the title row until the artifact loads. */
  title?: string;
}

interface ArtifactViewerState {
  /** The project whose viewer is mounted, or null outside a project. */
  projectId: string | null;
  target: ArtifactViewerTarget | null;
  userId: string | null;
  byUser: Record<string, ArtifactViewerTarget>;
  bind: (userId: string | null, projectId: string) => void;
  reset: () => void;
  setProjectId: (projectId: string | null) => void;
  open: (target: ArtifactViewerTarget) => void;
  close: () => void;
}

export const useArtifactViewerStore = create<ArtifactViewerState>()(
  persist(
    (set) => ({
      projectId: null,
      target: null,
      userId: null,
      byUser: {},
      bind: (userId, projectId) =>
        set((state) => {
          const saved = userId ? state.byUser[userId] : undefined;
          const target = saved?.projectId === projectId ? saved : null;
          // An explicit project switch ends the old viewer, not an app restart.
          const byUser =
            userId && saved && !target
              ? Object.fromEntries(Object.entries(state.byUser).filter(([id]) => id !== userId))
              : state.byUser;
          return { userId, projectId, target, byUser };
        }),
      setProjectId: (projectId) => set({ projectId }),
      open: (target) =>
        set((state) => ({
          target,
          byUser: state.userId ? { ...state.byUser, [state.userId]: target } : state.byUser,
        })),
      close: () =>
        set((state) => ({
          target: null,
          byUser: Object.fromEntries(
            Object.entries(state.byUser).filter(([id]) => id !== state.userId)
          ),
        })),
      reset: () => set({ projectId: null, userId: null, target: null, byUser: {} }),
    }),
    {
      name: 'kortix.artifactViewer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ byUser: state.byUser }),
      merge: (persisted, current) => {
        const saved = savedViewers.safeParse(persisted);
        return { ...current, byUser: saved.success ? saved.data.byUser : {} };
      },
    }
  )
);
