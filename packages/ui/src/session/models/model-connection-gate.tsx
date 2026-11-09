'use client';

import { ArrowRightIcon, CreditCardIcon, ImageBrokenIcon, KeyIcon } from '@phosphor-icons/react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useTranslations } from '../../i18n';

import { ProviderLogo } from '../../internal/lib/provider-branding';
import { Button } from '../../primitives/button';
import type { FlatModel } from '@kortix/sdk/react';
import { useModelConnectionGate } from './use-model-connection-gate';

/** Stable empty list so the hook's `models = []` default isn't re-allocated per render. */
const EMPTY_MODELS: FlatModel[] = [];

// Enter waits a beat (delay) so the composer paints first, then the bar slides
// out from under it — height opens the space while the strip translates down,
// same spring on both so they move as one surface. Exit runs faster than enter
// and slides back under.
const BAR_ENTER = { type: 'spring', duration: 0.5, bounce: 0, delay: 0.15 } as const;
const BAR_EXIT = { type: 'spring', duration: 0.35, bounce: 0 } as const;

// Enter waits a beat so the composer paints first, then the prompt rises into
// place. Exit is shorter: once a model connects, the row is no longer news.
const PROMPT_ENTER = { duration: 0.2, ease: [0.23, 1, 0.32, 1], delay: 0.15 } as const;
const PROMPT_EXIT = { duration: 0.15, ease: [0.23, 1, 0.32, 1] } as const;

/** The two subscriptions most people already pay for, in the order the prompt offers them. */
const SUBSCRIPTION_OPTIONS = [
  { providerId: 'openai', titleKey: 'useChatGpt', planKey: 'chatGptPlan' },
  { providerId: 'anthropic', titleKey: 'useClaude', planKey: 'claudePlan' },
] as const;

/**
 * The "no model connected" prompt: a row of its own UNDER the composer, a gap
 * apart, that names the fastest way in — sign in with a ChatGPT or Claude plan
 * the member already pays for. Each tile opens the provider dialog with that
 * provider already expanded, so the next click is the sign-in itself.
 *
 * It replaced a muted strip tucked behind the card ("No model connected —
 * connect one to start chatting" + one small button). New projects stalled
 * between `project_created` and `session_started`: the strip read as status,
 * not as the next step, and "Connect model" did not say which model or how.
 *
 * "Use an API key" opens the same dialog on the full provider list. "Upgrade"
 * shows only where billing sells a plan (`showUpgradeOption`).
 *
 * `required`: no model can run, so the row says "Connect a model to start".
 * Otherwise the project runs on Kortix models and the row is an offer ("Use
 * your ChatGPT or Claude plan") shown on an empty chat, without Upgrade.
 *
 * `show` must only flip on settled data (see `entitlementsPending`) — the
 * animation assumes it renders once with the final answer, not per-query.
 */
export function ModelConnectionBar({ show, required }: { show: boolean; required: boolean }) {
  const t = useTranslations('sessionUi.modelGate');
  const reduceMotion = useReducedMotion();
  const {
    canConnectProvider,
    canWriteProviders,
    openConnectProvider,
    openUpgrade,
    modal,
    showUpgradeOption,
  } = useModelConnectionGate(EMPTY_MODELS);
  // The optional offer is for people who can act on it. A read-only member
  // with working Kortix models has nothing to do here.
  const visible = show && (required || (canConnectProvider && canWriteProviders));

  return (
    <>
      {modal}
      <AnimatePresence initial={false}>
        {visible && (
          <m.section
            key="model-connection-prompt"
            aria-label={required ? t('promptTitle') : t('offerTitle')}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: PROMPT_ENTER }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, transition: PROMPT_EXIT }}
            className="mt-4 flex flex-col gap-2.5"
          >
            <div className="flex min-h-7 items-center justify-between gap-3 px-1">
              <p className="min-w-0 text-sm text-pretty">
                <span className="text-foreground font-medium">
                  {required ? t('promptTitle') : t('offerTitle')}
                </span>
                <span className="text-muted-foreground hidden sm:inline">
                  {' '}
                  {t('promptDescription')}
                </span>
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {canConnectProvider && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={() => openConnectProvider('providers')}
                  >
                    <KeyIcon className="size-3.5 shrink-0" />
                    {t('useApiKey')}
                  </Button>
                )}
                {required && showUpgradeOption && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={openUpgrade}
                  >
                    <CreditCardIcon className="size-3.5 shrink-0" />
                    {t('upgrade')}
                  </Button>
                )}
              </div>
            </div>
            {canConnectProvider && (
              <div className="grid gap-2 sm:grid-cols-2">
                {SUBSCRIPTION_OPTIONS.map((option) => (
                  <Button
                    key={option.providerId}
                    type="button"
                    variant="outline"
                    className="bg-background group h-auto justify-start gap-3 rounded-xl px-3 py-2.5 text-left"
                    onClick={() => openConnectProvider('providers', option.providerId)}
                  >
                    <ProviderLogo providerID={option.providerId} size="small" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-foreground truncate text-sm font-medium">
                        {t(option.titleKey)}
                      </span>
                      <span className="text-muted-foreground truncate text-xs font-normal">
                        {t(option.planKey)}
                      </span>
                    </span>
                    <ArrowRightIcon className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
                  </Button>
                ))}
              </div>
            )}
          </m.section>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * One line under the card when the selected model cannot read an attached image
 * (`modelRejectingAttachedImages`). Send is refused with the same words. The
 * composer never shows it beside `ModelConnectionBar`.
 */
export function ImagesUnsupportedBar({ modelName }: { modelName: string | null }) {
  const t = useTranslations('sessionUi.modelGate');
  // Keeps the last name through the exit animation, which runs after `modelName` clears.
  const [shownName, setShownName] = useState(modelName);
  if (modelName && modelName !== shownName) setShownName(modelName);

  return (
    <ComposerTray show={modelName !== null} trayKey="images-unsupported-bar">
      <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
        <ImageBrokenIcon className="size-3.5 shrink-0" />
        <span className="truncate">
          {t('imagesUnsupported', { model: shownName ?? '' })}
          <span className="hidden sm:inline"> — {t('imagesUnsupportedHint')}</span>
        </span>
      </div>
    </ComposerTray>
  );
}

/**
 * A strip that hangs behind the card's bottom edge: rendered as the card's next
 * sibling, pulled up under it (`-mt-4` on the clipper, cancelled by `pt-4` on
 * the strip), so the card — `isolate z-10`, opaque — paints over the overlap.
 * `-mt-4` lives on the clipper, never on the strip: the clipper is
 * `overflow-hidden` for the height animation and would clip a negative margin
 * on its child.
 */
function ComposerTray({
  show,
  trayKey,
  children,
}: {
  show: boolean;
  trayKey: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          key={trayKey}
          initial={reduceMotion ? { opacity: 0 } : { height: 0 }}
          animate={
            reduceMotion
              ? { opacity: 1, transition: { duration: 0.2 } }
              : { height: 'auto', transition: BAR_ENTER }
          }
          exit={
            reduceMotion
              ? { opacity: 0, transition: { duration: 0.15 } }
              : { height: 0, transition: BAR_EXIT }
          }
          className="relative z-0 -mt-4 overflow-hidden"
        >
          <m.div
            initial={reduceMotion ? false : { y: '-100%' }}
            animate={reduceMotion ? undefined : { y: '0%', transition: BAR_ENTER }}
            exit={reduceMotion ? undefined : { y: '-100%', transition: BAR_EXIT }}
            // `border-t-0`: the card's own bottom border is the seam. Drawing
            // one here too would put a second hairline under a card that
            // already has one. `rounded-b-xl` matches the card's radius so
            // the two share one silhouette; the top corners are square
            // because they live behind the card and are never seen.
            className="border-border bg-muted rounded-b-xl border border-t-0 pt-4"
          >
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">{children}</div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
