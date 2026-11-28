'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateConnections } from './invalidate-connections';
import { useTranslations } from '../../../i18n';

import { errorToast, successToast } from '../../../primitives/toast';
import { runConnectLinkFlow } from './use-connect-link';
import {
  listConnections,
  revokeConnection,
  DEFAULT_PROJECT_CONNECTION_LABEL,
  isSharedDefaultConnectConflict,
  projectConnectionConnectRestDeps as sdkProjectConnectDeps,
  projectConnectionConnectSteps as projectConnectSteps,
  type ProjectConnectRoute,
  type ProjectConnectionConnectDeps as ProjectConnectDeps,
} from '@kortix/sdk';

/** The shared-account connect route and its 409 fallback live in `@kortix/sdk`. */
export {
  DEFAULT_PROJECT_CONNECTION_LABEL,
  isSharedDefaultConnectConflict,
  projectConnectSteps,
  sdkProjectConnectDeps,
  type ProjectConnectDeps,
  type ProjectConnectRoute,
};

/**
 * Connect a labelled project-owned account under one connector.
 */
export function usePipedreamConnectProject(
  projectId: string,
  slug: string,
  onConnected: () => void,
) {
  const tI18nComplete = useTranslations('hardcodedUi.i18nComplete');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input?: {
      label?: string;
      beforeAuthorize?: (connectionId: string) => Promise<void>;
    }) => {
      const steps = projectConnectSteps(
        projectId,
        slug,
        input?.label,
        sdkProjectConnectDeps,
        input?.beforeAuthorize,
      );
      let authorizedBefore: ReadonlySet<string> = new Set();
      const result = await runConnectLinkFlow(async () => {
        const { connections } = await listConnections(projectId);
        authorizedBefore = new Set(connections.filter((row) => row.authorized !== false).map((row) => row.connection_id));
        return steps.start();
      }, steps.finalize, {
        abandon: async () => {
          const connectionId = steps.connectionId();
          if (connectionId && !authorizedBefore.has(connectionId)) {
            await revokeConnection(projectId, connectionId, { pendingOnly: true });
            await invalidateConnections(queryClient, projectId);
          }
        },
      });
      return { ...result, connectionId: steps.connectionId() };
    },
    onSuccess: (result) => {
      if (!result.connected) return;
      successToast(tI18nComplete.raw('textf04f9fcae903'));
      onConnected();
    },
    onError: (error: Error) => errorToast(error.message),
    // Refresh both a completed account and an abandoned account's cleanup.
    onSettled: () => invalidateConnections(queryClient, projectId),
  });
}
