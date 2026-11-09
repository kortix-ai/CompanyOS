'use client';

import { useWorkspaceModels } from '@kortix/sdk/react';

import { useTranslations } from '../../i18n';
import { SolidRightArrow } from '../../icons/solid-right-arrow';
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
        // `px-4` is the composer shell's gutter, so each row spans exactly the
        // card's width. Inside it, `pl-2.5` centres the logo under the
        // paperclip and `pr-3.5` centres the arrow under the send button.
        <div role="group" aria-label={t('offerTitle')} className="flex flex-col px-4">
          {PLANS.map((plan) => (
            <button
              key={plan.providerId}
              type="button"
              onClick={() => openConnectProvider('providers', plan.providerId)}
              className="hover:bg-muted/60 focus-visible:ring-kortix-base group flex min-w-0 items-center gap-3 rounded-lg py-2 pr-3.5 pl-2.5 text-left transition-colors outline-none focus-visible:ring-[0.6px]"
            >
              {plan.providerId === 'anthropic' ? (
                // Claude plans run through Claude Code, so the row shows its mark.
                <ClaudeCode className="size-5 shrink-0" />
              ) : (
                <ProviderLogo providerID={plan.providerId} size="xs" className="size-5 [&_img]:size-5" />
              )}
              <span className="text-foreground shrink-0 text-sm">{t(plan.labelKey)}</span>
              <span className="text-muted-foreground truncate text-sm">{t(plan.planKey)}</span>
              <SolidRightArrow className="text-muted-foreground group-hover:text-foreground ml-auto size-4 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
