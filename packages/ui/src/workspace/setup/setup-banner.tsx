'use client';

/**
 * The way back to `/workspaces/<id>/setup`. The workspace home shows it while
 * the setup page has an open step the viewer can finish: a connector to sign
 * in, a required secret, Slack. It counts the same steps as the page. A viewer
 * can dismiss it; the dismissal stays in this browser and holds until a step
 * opens that was not open then.
 */

import { useProjectAccountId } from '@kortix/sdk/react';
import { XIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { useTranslations } from '../../i18n';
import { cn } from '../../lib/utils';
import { PROJECT_ACTIONS } from '../../internal/lib/project-actions';
import { useProjectCan } from '../../internal/lib/use-project-can';
import { Alert, AlertActions, AlertTitle } from '../../primitives/alert';
import { Button } from '../../primitives/button';
import { UiLink as Link } from '../../providers/ui-provider';
import { openStepsFor, setupBannerDismissed } from './setup-steps';
import { useSetupSteps } from './use-setup-steps';

const DISMISS_KEY = (projectId: string) => `kortix.setupBanner.dismissed.${projectId}`;

/** The step ids that were open when the viewer dismissed the banner, or null. */
function readDismissed(projectId: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY(projectId));
    const ids: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

export function SetupBanner({ projectId, className }: { projectId: string; className?: string }) {
  const t = useTranslations('workspaceSetup');
  const accountId = useProjectAccountId(projectId);
  const canConnect =
    useProjectCan(projectId, PROJECT_ACTIONS.PROJECT_CONNECTOR_WRITE, { accountId }).allowed === true;
  const canSetSecrets = useProjectCan(projectId, PROJECT_ACTIONS.PROJECT_SECRET_WRITE).allowed === true;
  const { steps } = useSetupSteps(projectId, { enabled: canConnect || canSetSecrets });
  const open = openStepsFor(steps, { connect: canConnect, setSecrets: canSetSecrets });
  const [dismissed, setDismissed] = useState(() => (typeof window === 'undefined' ? null : readDismissed(projectId)));
  if (open.length === 0 || setupBannerDismissed(open, dismissed)) return null;

  const dismiss = () => {
    const ids = open.map((step) => step.id);
    try {
      window.localStorage.setItem(DISMISS_KEY(projectId), JSON.stringify(ids));
    } catch {
      // Private mode: the banner hides for this view only.
    }
    setDismissed(ids);
  };

  return (
    // One line: the title centers on the button, not on the alert's first line.
    <Alert variant="default" className={cn('items-center', className)} data-testid="setup-banner">
      <AlertTitle>{t('bannerTitle', { left: open.length })}</AlertTitle>
      <AlertActions>
        <Button asChild variant="outline" size="sm">
          <Link href={`/workspaces/${projectId}/setup`}>{t('title')}</Link>
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label={t('bannerDismiss')} onClick={dismiss}>
          <XIcon className="size-3.5" />
        </Button>
      </AlertActions>
    </Alert>
  );
}
