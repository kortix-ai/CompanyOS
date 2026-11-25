'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listWorkspaceBots, setWorkspaceBotPaused } from '../core/rest/projects-client/bots';
import { contract } from './query-contracts';
import { qk } from './query-keys';

/**
 * The bots the caller can message (`kortix_bot` flag). Its key sits under the
 * spaces key, so opening a bot's chat (`useOpenWorkspaceDm`) refreshes its
 * `chat_space_id`. Pass `enabled: false` while the flag is off: the route
 * answers 403 then.
 */
export function useWorkspaceBots(workspaceId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.project.bots(workspaceId ?? ''),
    queryFn: () => listWorkspaceBots(workspaceId as string),
    enabled: !!workspaceId && (options?.enabled ?? true),
    ...contract('inventory'),
  });
}

/** Pause or resume a bot (`setWorkspaceBotPaused`); refreshes the bot list. */
export function useSetWorkspaceBotPaused(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, paused }: { name: string; paused: boolean }) => setWorkspaceBotPaused(workspaceId, name, paused),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.project.bots(workspaceId) }),
  });
}
