'use client';

import { ArrowRightIcon } from '@phosphor-icons/react';
import { useWorkspaceModels } from '@kortix/sdk/react';

import { useTranslations } from '../../i18n';
import { ClaudeCode } from '../../internal/icons/claude-code';
import { ProviderLogo } from '../../internal/lib/provider-branding';
import { hasRunnableSubscriptionModel } from './model-availability';
import { useModelConnectionGate } from './use-model-connection-gate';

const PLANS = [
  { providerId: 'openai', labelKey: 'connectChatGpt', planKey: 'chatGptPlan' },
  { providerId: 'anthropic', labelKey: 'connectClaude', planKey: 'claudePlan' },
] as const;

/**
 * Two rows under the project home composer: "Connect ChatGPT" and "Connect
 * Claude". Each opens the provider dialog with that provider already expanded,
 * so the next click is the sign-in.
 *
 * New projects run on Kortix models, and most people already pay for ChatGPT
 * or Claude. The rows read like the starter suggestions that used to sit here:
 * no box, no fill until hover.
 *
 * Shown only when the project already has runnable models (it is an offer, not
 * a gate — `ModelConnectionBar` owns "no model at all"), no ChatGPT or Claude
 * plan serves one yet, and the viewer may change the project's models.
 */
export function SubscriptionOffer({ projectId }: { projectId: string }) {
  const t = useTranslations('sessionUi.modelGate');
  const models = useWorkspaceModels(projectId);
  const { canConnectProvider, canWriteProviders, openConnectProvider, modal } =
    useModelConnectionGate(undefined, { projectId });

  const show =
    canConnectProvider &&
    canWriteProviders &&
    models.length > 0 &&
    !hasRunnableSubscriptionModel(models);

  return (
    <>
      {modal}
      {show ? (
        <div role="group" aria-label={t('offerTitle')} className="flex flex-col">
          {PLANS.map((plan) => (
            <button
              key={plan.providerId}
              type="button"
              onClick={() => openConnectProvider('providers', plan.providerId)}
              className="hover:bg-muted/60 focus-visible:ring-kortix-base group flex min-w-0 items-center gap-3 rounded-lg px-4 py-2 text-left transition-colors outline-none focus-visible:ring-[0.6px]"
            >
              {plan.providerId === 'anthropic' ? (
                // Claude plans run through Claude Code, so the row shows its mark.
                <ClaudeCode className="size-4 shrink-0" />
              ) : (
                <ProviderLogo providerID={plan.providerId} size="xs" />
              )}
              <span className="text-foreground shrink-0 text-sm">{t(plan.labelKey)}</span>
              <span className="text-muted-foreground truncate text-sm">{t(plan.planKey)}</span>
              <ArrowRightIcon className="text-muted-foreground group-hover:text-foreground ml-auto size-3.5 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
