'use client';

import { useWorkspaceModels } from '@kortix/sdk/react';
import { useState } from 'react';

import { useTranslations } from '../../i18n';
import { Close } from '../../icons/close';
import { SolidRightArrow } from '../../icons/solid-right-arrow';
import { ClaudeCode } from '../../internal/icons/claude-code';
import { ProviderLogo } from '../../internal/lib/provider-branding';
import { hasRunnableSubscriptionModel } from './model-availability';
import { useModelConnectionGate } from './use-model-connection-gate';

const PLANS = [
  { providerId: 'openai', name: 'ChatGPT', labelKey: 'connectChatGpt', planKey: 'chatGptPlan' },
  { providerId: 'anthropic', name: 'Claude', labelKey: 'connectClaude', planKey: 'claudePlan' },
] as const;

type PlanId = (typeof PLANS)[number]['providerId'];

const dismissedKey = (projectId: string) => `kortix:subscription-offer-dismissed:${projectId}`;

/** The rows this browser hid for this project. Empty when storage is blocked. */
function readDismissed(projectId: string): PlanId[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(dismissedKey(projectId)) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is PlanId => PLANS.some((plan) => plan.providerId === id))
      : [];
  } catch {
    return [];
  }
}

function writeDismissed(projectId: string, ids: PlanId[]) {
  try {
    window.localStorage.setItem(dismissedKey(projectId), JSON.stringify(ids));
  } catch {
    // Storage blocked (private mode): the row stays hidden until reload.
  }
}

/**
 * Two rows under the project home composer: "Connect ChatGPT" and "Connect
 * Claude". Each opens the provider dialog with that provider already expanded,
 * so the next click is the sign-in.
 *
 * New projects run on Kortix models, and most people already pay for ChatGPT
 * or Claude. The rows read like the starter suggestions that used to sit here:
 * no box, no fill until hover.
 *
 * Hovering a row swaps its arrow for a ✕ in the same slot. The ✕ hides that
 * row for this project in this browser (`localStorage`), so someone who stays
 * on Kortix models is not asked again on every visit.
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
  const [dismissed, setDismissed] = useState<PlanId[]>(() => readDismissed(projectId));

  const plans = PLANS.filter((plan) => !dismissed.includes(plan.providerId));
  const show =
    plans.length > 0 &&
    canConnectProvider &&
    canWriteProviders &&
    models.length > 0 &&
    !hasRunnableSubscriptionModel(models);

  const dismiss = (id: PlanId) => {
    const next = [...dismissed, id];
    setDismissed(next);
    writeDismissed(projectId, next);
  };

  return (
    <>
      {modal}
      {show ? (
        // `px-4` is the composer shell's gutter, so each row spans exactly the
        // card's width. Inside it, `pl-2.5` centres the logo under the
        // paperclip and `pr-3.5` centres the arrow under the send button.
        <div role="group" aria-label={t('offerTitle')} className="flex flex-col px-4">
          {plans.map((plan) => (
            <div key={plan.providerId} className="group relative">
              <button
                type="button"
                onClick={() => openConnectProvider('providers', plan.providerId)}
                className="hover:bg-muted/60 focus-visible:ring-kortix-base flex w-full min-w-0 items-center gap-3 rounded-lg py-2 pr-3.5 pl-2.5 text-left transition-colors outline-none focus-visible:ring-[0.6px]"
              >
                {plan.providerId === 'anthropic' ? (
                  // Claude plans run through Claude Code, so the row shows its mark.
                  <ClaudeCode className="size-5 shrink-0" />
                ) : (
                  <ProviderLogo providerID={plan.providerId} size="xs" className="size-5 [&_img]:size-5" />
                )}
                <span className="text-foreground shrink-0 text-sm">{t(plan.labelKey)}</span>
                <span className="text-muted-foreground truncate text-sm">{t(plan.planKey)}</span>
                <SolidRightArrow className="text-muted-foreground ml-auto size-4 shrink-0 transition-opacity group-focus-within:opacity-0 group-hover:opacity-0" />
              </button>
              {/* A sibling, not a child: a button cannot hold a button. It sits
                  over the arrow's slot — `w-11` is `pr-3.5` + the arrow +
                  `pr-3.5` — so the ✕ centres where the arrow was. */}
              <button
                type="button"
                aria-label={t('hidePlan', { name: plan.name })}
                onClick={() => dismiss(plan.providerId)}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-kortix-base absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-lg opacity-0 transition-opacity outline-none group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-[0.6px]"
              >
                <Close />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
