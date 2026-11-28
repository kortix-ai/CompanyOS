/**
 * useProjectSessionStats — token and cost totals of a project's sessions, for
 * the project detail page. The SDK reads and sums each session's transcript
 * (`useSessionStatsTotals`); this hook only names the runtime: the bound
 * session's.
 */

import { useSessionStatsTotals } from '@kortix/sdk/react';
import { useSessionRuntime } from '@/components/session/SessionRuntime';

export { sumSessionTokens as totalTokens, type SessionStats } from '@kortix/sdk';

export function useProjectSessionStats(sessionIds: string[], enabled: boolean = true) {
  // The runtime these sessions live on: the bound session's. Its sandbox id
  // keys the cache, so one computer's totals never show under another.
  const runtime = useSessionRuntime();
  const runtimeId = runtime?.switched ? (runtime.sandbox?.sandbox_id ?? null) : null;
  return useSessionStatsTotals(runtimeId, sessionIds, enabled);
}
