'use client';

import { CheckCircleIcon, KeyIcon } from '@phosphor-icons/react';
import { getSlackMode, type AdminConnector } from '@kortix/sdk';
import { useProjectAccountId } from '@kortix/sdk/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { connectorHref } from '../../customize/connectors/connector-routes';
import { SetCredentialModal } from '../../customize/sections/connectors-view';
import { ProjectSecretDialog } from '../../customize/sections/view/secrets-view';
import { CapabilityPageShell } from '../../customize/shared/capability-page-shell';
import { useTranslations } from '../../i18n';
import { ConnectorLogo } from '../../internal/connector-logo/connector-logo';
import { installedConnectorLogoSource } from '../../internal/connector-logo/connector-logo-source';
import { useAddAccount } from '../../internal/hooks/connectors/use-add-account';
import { SolidCheckIcon } from '../../internal/icons/solid-check-icon';
import { PROJECT_ACTIONS } from '../../internal/lib/project-actions';
import { useProjectCan } from '../../internal/lib/use-project-can';
import { Alert, AlertDescription, AlertTitle } from '../../primitives/alert';
import { Button } from '../../primitives/button';
import { EmptyState } from '../../primitives/empty-state';
import { EmptyArt } from '../../primitives/empty-art';
import { ErrorState } from '../../primitives/error-state';
import { Skeleton } from '../../primitives/skeleton';
import { UiLink as Link, useUiSearchParams } from '../../providers/ui-provider';
import type { SetupStep } from './setup-steps';
import { useSetupSteps } from './use-setup-steps';

/** While a step is open, read it again this often: the person may finish it in another tab. */
const OPEN_STEP_POLL_MS = 5_000;

/**
 * `/workspaces/<id>/setup`: every step of a workspace's setup that only a
 * person can do, on one page. `kortix onboard` opens it in the browser instead
 * of printing a link per step, and `kortix onboard --wait` continues when the
 * page shows every step done. A missing model never reaches this page: the
 * workspace shell shows "Connect a model" first (`ProjectShell`).
 */
export function WorkspaceSetupPage({ projectId }: { projectId: string }) {
  const t = useTranslations('workspaceSetup');
  const params = useUiSearchParams();
  const accountId = useProjectAccountId(projectId);
  const canConnect =
    useProjectCan(projectId, PROJECT_ACTIONS.PROJECT_CONNECTOR_WRITE, { accountId }).allowed === true;
  const canSetSecrets = useProjectCan(projectId, PROJECT_ACTIONS.PROJECT_SECRET_WRITE).allowed === true;

  const { steps, usesSlack, loading, failed, refresh } = useSetupSteps(projectId, {
    slackRequested: params.get('slack') === '1',
    pollMs: OPEN_STEP_POLL_MS,
  });
  // The same cache entry as the Channels page (`useSlackMode`).
  const slackModeQuery = useQuery({
    queryKey: ['channels', 'slack-mode', projectId],
    queryFn: () => getSlackMode(projectId),
    enabled: usesSlack,
    staleTime: 60_000,
  });
  const done = steps.filter((step) => step.done).length;
  const workspaceLink = (
    <Button asChild variant="outline" size="sm">
      <Link href={`/workspaces/${projectId}`}>{t('openWorkspace')}</Link>
    </Button>
  );

  return (
    <CapabilityPageShell
      title={t('title')}
      description={loading || failed || steps.length === 0 ? t('descriptionIdle') : t('description', { done, total: steps.length })}
    >
      {loading ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <li key={index}>
              <Skeleton className="h-14 rounded-md" />
            </li>
          ))}
        </ul>
      ) : failed ? (
        <ErrorState
          size="sm"
          title={t('loadFailed')}
          action={
            <Button variant="outline" size="sm" onClick={refresh}>
              {t('tryAgain')}
            </Button>
          }
        />
      ) : steps.length === 0 ? (
        <EmptyState
          media={<EmptyArt icon={CheckCircleIcon} />}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={workspaceLink}
        />
      ) : (
        <div className="space-y-4">
          {done === steps.length ? (
            <Alert variant="success">
              <AlertTitle>{t('completeTitle')}</AlertTitle>
              <AlertDescription>{t('completeDescription')}</AlertDescription>
            </Alert>
          ) : null}
          <ul className="space-y-2">
            {steps.map((step) => (
              <StepRow
                key={step.id}
                projectId={projectId}
                step={step}
                canConnect={canConnect}
                canSetSecrets={canSetSecrets}
                slackInstallUrl={slackModeQuery.data?.oauth_available ? slackModeQuery.data.install_url : null}
                onChanged={refresh}
              />
            ))}
          </ul>
          {done === steps.length ? <div>{workspaceLink}</div> : null}
        </div>
      )}
    </CapabilityPageShell>
  );
}

function StepRow({
  projectId,
  step,
  canConnect,
  canSetSecrets,
  slackInstallUrl,
  onChanged,
}: {
  projectId: string;
  step: SetupStep;
  canConnect: boolean;
  canSetSecrets: boolean;
  slackInstallUrl: string | null;
  onChanged: () => void;
}) {
  const t = useTranslations('workspaceSetup');
  const kind = step.kind === 'connector' ? t('kindConnector') : step.kind === 'secret' ? t('kindSecret') : t('kindSlack');
  return (
    <li className="bg-background flex items-center gap-3 rounded-md border px-4 py-2.5">
      {step.kind === 'connector' ? (
        <ConnectorLogo source={installedConnectorLogoSource(step.connector)} size="lg" />
      ) : step.kind === 'slack' ? (
        <ConnectorLogo source={{ nativeApp: 'slack' }} size="lg" />
      ) : (
        <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
          <KeyIcon className="text-muted-foreground size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">{step.name}</p>
        <p className="text-muted-foreground truncate text-xs">{kind}</p>
      </div>
      {step.done ? (
        <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
          <SolidCheckIcon className="text-kortix-green size-4 shrink-0" />
          {t('done')}
        </span>
      ) : step.kind === 'connector' ? (
        canConnect ? <ConnectorAction projectId={projectId} connector={step.connector} name={step.name} broken={step.broken} onChanged={onChanged} /> : null
      ) : step.kind === 'secret' ? (
        canSetSecrets ? <SecretAction projectId={projectId} step={step} onChanged={onChanged} /> : null
      ) : (
        <SlackAction projectId={projectId} installUrl={slackInstallUrl} />
      )}
    </li>
  );
}

/**
 * Connect: the shared account every agent of the workspace uses, signed in at
 * once, the same as the connector page's Add account with "Everyone". A
 * connector whose account broke opens its own page, where the account is.
 */
function ConnectorAction({
  projectId,
  connector,
  name,
  broken,
  onChanged,
}: {
  projectId: string;
  connector: AdminConnector;
  name: string;
  broken: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('workspaceSetup');
  const [credential, setCredential] = useState<{ connectionId: string; owner: 'project' | 'me' } | null>(null);
  const add = useAddAccount({ projectId, connector, displayName: name, onAdded: onChanged, onCredential: setCredential });
  if (broken) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href={connectorHref(projectId, connector.slug)}>{t('reconnect', { name })}</Link>
      </Button>
    );
  }
  return (
    <>
      <Button
        size="sm"
        disabled={add.pending}
        aria-busy={add.pending}
        onClick={() => add.submit({ label: add.proposedLabel(), audience: 'project', picked: { memberIds: [], groupIds: [] } })}
      >
        {t('connect', { name })}
      </Button>
      {credential ? (
        <SetCredentialModal
          key={credential.connectionId}
          projectId={projectId}
          connector={connector}
          connectionId={credential.connectionId}
          owner={credential.owner}
          open
          onOpenChange={(open) => {
            if (!open) setCredential(null);
          }}
          onSaved={() => {
            setCredential(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function SecretAction({
  projectId,
  step,
  onChanged,
}: {
  projectId: string;
  step: Extract<SetupStep, { kind: 'secret' }>;
  onChanged: () => void;
}) {
  const t = useTranslations('workspaceSetup');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t('setSecret', { name: step.name })}
      </Button>
      <ProjectSecretDialog projectId={projectId} row={step.row} open={open} onOpenChange={setOpen} onSaved={onChanged} />
    </>
  );
}

/** One-click "Add to Slack" in a new tab when the host has the Slack app; else the Channels page, which takes a bot token. */
function SlackAction({ projectId, installUrl }: { projectId: string; installUrl: string | null }) {
  const t = useTranslations('workspaceSetup');
  return installUrl ? (
    <Button asChild size="sm">
      <a href={installUrl} target="_blank" rel="noopener noreferrer">
        {t('addSlack')}
      </a>
    </Button>
  ) : (
    <Button asChild size="sm" variant="secondary">
      <Link href={`/workspaces/${projectId}/admin/connectors?scope=channels`}>{t('connectSlack')}</Link>
    </Button>
  );
}
