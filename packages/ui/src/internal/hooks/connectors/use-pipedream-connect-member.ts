'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateConnections } from './invalidate-connections';
import { useTranslations } from '../../../i18n';

import { errorToast, successToast } from '../../../primitives/toast';
import { runConnectLinkFlow } from './use-connect-link';
import {
  pipedreamConnectConnection,
  pipedreamFinalizeConnection,
  listConnections,
  reconcileMemberConnection,
  revokeConnection,
} from '@kortix/sdk';

/**
 * Connect the current user's private account for a connector.
 */
export function usePipedreamConnectMember(
  projectId: string,
  slug: string,
  onConnected: () => void,
) {
  const tI18nComplete = useTranslations('hardcodedUi.i18nComplete');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { label?: string }) => {
      let connectionId: string | null = null;
      let wasAuthorized = false;
      const result = await runConnectLinkFlow(
        async () => {
          const { connections } = await listConnections(projectId);
          const connection = await reconcileMemberConnection(projectId, {
            connector_alias: slug,
            label: input?.label?.trim() || 'Private connection',
          });
          connectionId = connection.connection_id;
          wasAuthorized = connections.some((row) => row.connection_id === connectionId && row.authorized !== false);

          return pipedreamConnectConnection(projectId, connection.connection_id);
        },
        () => {
          if (!connectionId) throw new Error('The private connection was not created.');
          return pipedreamFinalizeConnection(projectId, connectionId);
        },
        { abandon: async () => {
          if (connectionId && !wasAuthorized) {
            await revokeConnection(projectId, connectionId, { pendingOnly: true });
            await invalidateConnections(queryClient, projectId);
          }
        } },
      );
      // The account just created, so a caller can finalize exactly that one.
      return { ...result, connectionId };
    },
    onSuccess: (res) => {
      if (!res.connected) return;
      successToast(tI18nComplete.raw('text5fac4e8e1d8f'));
      onConnected();
    },
    onError: (err: Error) => errorToast(err.message),
    // Refresh both a completed account and an abandoned account's cleanup.
    onSettled: () => invalidateConnections(queryClient, projectId),
  });
}
