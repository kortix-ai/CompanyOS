'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { requestWorkspaceAccess, type RequestWorkspaceAccessResult } from '../core/rest/projects-client/access';
import { getWorkspace, restoreWorkspace } from '../core/rest/projects-client/workspaces';
import { qk } from './query-keys';

/** How often the waiting screen re-checks whether a manager approved the request. */
const APPROVAL_POLL_MS = 15_000;

/** A sent access request that waits on a manager: `created` now, or `pending` from before. */
export type WorkspaceAccessWaiting = Exclude<RequestWorkspaceAccessResult['status'], 'already_has_access'>;

/** Pulls the HTTP status off either error shape the SDK can surface. */
export function errorStatus(error: unknown): number | undefined {
  return (
    (error as { status?: number; response?: { status?: number } } | null)?.status ??
    (error as { response?: { status?: number } } | null)?.response?.status
  );
}

/**
 * The gate's read. It uses the shell's canonical project slot, so the
 * shell, ⌘K and settings read this answer instead of asking again (2 GETs per
 * load before). A user switch empties the cache before the new user is
 * published (`resetClientState`).
 */
export function workspaceAccessQueryOptions(workspaceId: string) {
  return {
    queryKey: qk.project.summary(workspaceId),
    queryFn: () => getWorkspace(workspaceId, { showErrors: false }),
    retry: false,
  } as const;
}

/** One workspace's access gate: read, request, waiting state, 15 s approval poll, manual recheck. Key it on the signed-in user. */
export function useWorkspaceAccess(workspaceId: string, { authReady }: { authReady: boolean }) {
  const queryClient = useQueryClient();
  // A submitted request is held HERE, above the error branch, so a transient
  // 401/500/offline poll result cannot unmount the waiting screen and hand the
  // user a fresh request form for a request they already sent.
  const [waiting, setWaiting] = useState<WorkspaceAccessWaiting | null>(null);

  const query = useQuery({
    ...workspaceAccessQueryOptions(workspaceId),
    enabled: authReady && !!workspaceId,
    // Keep a gone verdict across remounts; transient errors may recover.
    retryOnMount: (query) => errorStatus(query.state.error) !== 404,
    refetchOnMount: (query) => errorStatus(query.state.error) === 404 ? false : 'always',
  });

  const { refetch } = query;
  // Background poll: silent, and must never touch the button's pending state.
  const recheck = useCallback(() => {
    if (authReady) void refetch();
  }, [authReady, refetch]);

  // The user's own "Check now" press, tracked separately so the 15s background
  // poll cannot disable the button under their cursor.
  const [manualRecheck, setManualRecheck] = useState(false);
  const recheckNow = useCallback(() => {
    if (!authReady) return;
    setManualRecheck(true);
    void refetch().finally(() => setManualRecheck(false));
  }, [authReady, refetch]);

  // Stop the moment access lands, or the interval outlives the gate: this
  // component wraps the shell for the whole session, so a poll that ignores
  // success keeps calling getProject every 15s while the user works. A gone
  // workspace (404) stops it too: waiting on it would poll forever.
  const polling =
    authReady && !query.isSuccess && waiting !== null && !(query.isError && errorStatus(query.error) === 404);

  // Poll while waiting so "this page opens on its own" is a fact, not a promise
  // the user has to keep by reloading. `recheck` is stable, so the interval is
  // a true 15s cadence rather than 15s-since-the-last-render.
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(recheck, APPROVAL_POLL_MS);
    return () => clearInterval(id);
  }, [polling, recheck]);

  const request = useMutation({
    mutationFn: (message: string) => requestWorkspaceAccess(workspaceId, message),
    onSuccess: (result) => {
      if (result.status !== 'already_has_access') {
        setWaiting(result.status);
        return;
      }
      // already_has_access — the project is readable now, so show the project.
      void queryClient.invalidateQueries({ queryKey: qk.project.summary(workspaceId) });
    },
  });

  return { query, waiting, rechecking: manualRecheck, recheckNow, request };
}

export type WorkspaceAccess = ReturnType<typeof useWorkspaceAccess>;

/** Restore a `deleting` workspace (owners), then refetch the workspace lists and its access read. */
export function useRestoreWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => restoreWorkspace(workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.projects.scope() });
      void queryClient.refetchQueries({ queryKey: qk.project.summary(workspaceId), exact: true });
    },
  });
}
