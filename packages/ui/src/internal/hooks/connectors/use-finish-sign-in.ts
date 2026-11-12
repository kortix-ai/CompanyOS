'use client';

import { connectionSignInSteps, type Connection } from '@kortix/sdk';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from '../../../i18n';

import { errorToast, successToast } from '../../../primitives/toast';
import { runConnectLinkFlow } from './use-connect-link';

/**
 * Finish the sign-in of one account whose sign-in started and never finished
 * (an agent's link the person used outside Kortix, an abandoned window).
 *
 * The window opens inside the click. The first request asks the provider: a
 * sign-in that already finished there is recorded and the window closes. Only
 * an unfinished one goes on to a new sign-in page for the same account.
 */
export function useFinishSignIn(projectId: string, slug: string, onConnected: () => void) {
  const t = useTranslations('connectSignIn');
  return useMutation({
    mutationFn: async (account: Pick<Connection, 'connection_id' | 'owner_type'>) => {
      const steps = connectionSignInSteps(projectId, slug, account);
      return runConnectLinkFlow(steps.start, steps.finalize);
    },
    onSuccess: () => {
      successToast(t('signInFinished'));
      onConnected();
    },
    onError: (error: Error) => errorToast(error.message),
  });
}
