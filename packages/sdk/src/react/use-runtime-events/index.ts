'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRuntimeCompactionStore } from '../../browser/stores/runtime-compaction-store';
import { useRuntimePendingStore } from '../../browser/stores/runtime-pending-store';
import { useSandboxConnectionStore } from '../../browser/stores/sandbox-connection-store';
import { useServerStore } from '../../browser/stores/server-store';
import { useSyncStore } from '../../browser/stores/sync-store';
import { onHostSignal } from '../../core/session/host-signals';
import { useKortixRouteWorkspaceId } from '../route-project';
import { useCurrentRuntime } from '../use-current-runtime';
import { connectRuntimeStream } from './connect-stream';
import { shouldReconnectOnHostSignal } from './runtime-stream-signals';
import { createStreamRevival } from './stream-revival';
import { useEventStreamRefs } from './use-event-stream-refs';

export { subscribeRuntimeStream, type RuntimeStreamSignal } from './runtime-stream-signals';

/**
 * Connects to the session runtime's SSE event stream via the SDK and
 * performs INCREMENTAL cache updates on React Query data.
 *
 * Instead of invalidating queries (which triggers full refetches),
 * we use setQueryData to surgically update messages, parts, sessions, etc.
 * This matches the SolidJS reference implementation's approach.
 *
 * This hook is a THIN React wrapper: the actual connect/reconnect/backoff,
 * heartbeat watchdog, and event-coalescing machinery is framework-free and
 * lives in `core/stream/event-stream.ts`'s `openEventStream()`. Everything here is
 * either genuinely React-only (effect lifecycle, store subscriptions) or
 * needs the React Query `QueryClient` (cache reads/writes, which
 * `createEventHandler` and `hydrateFromPending` below perform).
 */
export function useRuntimeEventStream(
  options: {
    enabled?: boolean;
    /**
     * Read runtime events from this session's stream (`GET .../events`, R5.3)
     * instead of the sandbox proxy's `/global/event`. `useSession` passes both.
     */
    projectId?: string;
    sessionId?: string;
    /**
     * @deprecated Ignored. Every box past the runtime floor serves its log (`runtime.log.v1`): a
     * connect or a resync reads only `GET /kortix/runtime/pending`, and no frame re-reads a
     * transcript tail or a session record.
     */
    logNative?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  // The project this SSE connection's events are about — threaded into
  // `refetchKortixSessionMirrors` so a title/tree mirror refetch stays scoped
  // to the project actually being viewed instead of guessing at "every
  // project" (see that function's doc comment in `helpers.ts`).
  const projectId = useKortixRouteWorkspaceId();
  const addPermission = useRuntimePendingStore((s) => s.addPermission);
  const removePermission = useRuntimePendingStore((s) => s.removePermission);
  const addQuestion = useRuntimePendingStore((s) => s.addQuestion);
  const removeQuestion = useRuntimePendingStore((s) => s.removeQuestion);
  const clearPending = useRuntimePendingStore((s) => s.clear);
  const stopCompaction = useRuntimeCompactionStore((s) => s.stopCompaction);
  const startCompaction = useRuntimeCompactionStore((s) => s.startCompaction);
  const applySyncEvent = useSyncStore((s) => s.applyEvent);
  // Re-render (and re-read getActiveServerUrl, which resolves current-runtime) when
  // the session's runtime changes — so the SSE re-subscribes to the new daemon.
  const runtimeVersion = useCurrentRuntime((s) => s.version);
  const activeServerUrl = useServerStore((s) => s.getActiveServerUrl());
  const sandboxStatus = useSandboxConnectionStore((s) => s.status);
  const runtimeHealthy = useSandboxConnectionStore((s) => s.healthy);
  const isMountRef = useRef(true);
  const prevRuntimeVersionRef = useRef(runtimeVersion);
  const prevServerUrlRef = useRef(activeServerUrl);
  // Bumped when a parked stream earns another attempt. It is an effect DEP, so
  // the bump tears the dead handle down and opens a fresh one — the same path
  // a runtime switch takes, rather than a second reconnect mechanism.
  const [streamGeneration, setStreamGeneration] = useState(0);
  const revival = useMemo(
    () => createStreamRevival(() => setStreamGeneration((generation) => generation + 1)),
    [],
  );
  useEffect(() => revival.stop, [revival]);
  // A host without DOM events (React Native) reports foreground, online and a
  // manual retry. A fresh generation reconnects and re-reads the transcripts.
  useEffect(
    () =>
      onHostSignal((signal) => {
        const lastEvidenceAt = useSandboxConnectionStore.getState().lastRuntimeEvidenceAt;
        if (!shouldReconnectOnHostSignal(signal, lastEvidenceAt, Date.now())) return;
        setStreamGeneration((generation) => generation + 1);
      }),
    [],
  );

  const {
    normalizeDiagnosticPaths,
    fetchLspDiagnosticsDebounced,
    markSessionAbortedLocally,
    reconcileMissingBusySessions,
  } = useEventStreamRefs({ queryClient, stopCompaction, applySyncEvent });

  useEffect(
    () =>
      connectRuntimeStream({
        options: {
          enabled: options.enabled,
          projectId: options.projectId,
          sessionId: options.sessionId,
        },
        queryClient,
        projectId,
        runtimeVersion,
        activeServerUrl,
        sandboxStatus,
        runtimeHealthy,
        isMountRef,
        prevRuntimeVersionRef,
        prevServerUrlRef,
        revival,
        normalizeDiagnosticPaths,
        fetchLspDiagnosticsDebounced,
        markSessionAbortedLocally,
        reconcileMissingBusySessions,
        addPermission,
        removePermission,
        addQuestion,
        removeQuestion,
        clearPending,
        startCompaction,
        stopCompaction,
        applySyncEvent,
      }),
    // NOTE: urlVersion is intentionally excluded from deps. We only reconnect
    // when the resolved activeServerUrl actually changes, which avoids
    // reconnecting on metadata-only updates while still recovering from
    // stale SSE connections after sandbox/proxy URL changes.
    [
      queryClient,
      addPermission,
      removePermission,
      addQuestion,
      removeQuestion,
      clearPending,
      runtimeVersion,
      activeServerUrl,
      sandboxStatus,
      runtimeHealthy,
      options.enabled,
      options.projectId,
      options.sessionId,
      applySyncEvent,
      stopCompaction,
      projectId,
      revival,
      // A revived park re-opens the stream through this effect. Without it the
      // park stayed terminal for the page.
      streamGeneration,
    ],
  );
}

/**
 * Headless provider component that connects the SSE event stream.
 * Renders nothing — just call useRuntimeEventStream().
 *
 * Mount this once on any page that needs live session updates
 * (dashboard layout, onboarding page, etc.).
 */
export function RuntimeEventStreamProvider() {
  useRuntimeEventStream();
  return null;
}
