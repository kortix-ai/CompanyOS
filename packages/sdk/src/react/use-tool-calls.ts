'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { type ListToolCallsOptions, listToolCalls } from '../core/rest/projects-client/tool-calls';
import { qk } from './query-keys';

export const TOOL_CALLS_PAGE_SIZE = 50;

export type ToolCallFilters = Omit<ListToolCallsOptions, 'cursor' | 'limit'>;

/**
 * A workspace's tool call log, newest first, one keyset page at a time
 * (`fetchNextPage` follows `next_cursor`). It refreshes every 15 s while only
 * the newest page is loaded and no `until` closes the window.
 */
export function useToolCalls(workspaceId: string | undefined, filters: ToolCallFilters = {}) {
  // Blank filters are no filter: the same key, the same cache entry.
  const set = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => typeof v === 'string' && v.trim()),
  ) as ToolCallFilters;
  return useInfiniteQuery({
    queryKey: qk.project.toolCalls(workspaceId ?? '', set),
    queryFn: ({ pageParam }) =>
      listToolCalls(workspaceId!, { ...set, limit: TOOL_CALLS_PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: !!workspaceId,
    placeholderData: (previous) => previous,
    refetchInterval: (query) => ((query.state.data?.pages.length ?? 1) > 1 || set.until ? false : 15_000),
  });
}
