'use client';

import { useLocale, useTranslations } from '@/i18n/use-translations';
import { Button } from '@kortix/ui/button';
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@kortix/ui/disclosure';
import {
  DEFAULT_COMPUTE_CREDITS_PER_HOUR,
  DEFAULT_COMPUTE_HOURLY_PRICE_USD,
  DEFAULT_COMPUTE_SPEC,
} from '@kortix/ui/internal/billing/compute-pricing';
import { SettingsRow } from '@kortix/ui/settings-row';

/** A rate in the billing pane's existing definition list, not another card. */
export function ComputeBillingExplainer() {
  const t = useTranslations('billing.pricing.computer');
  const locale = useLocale();
  const rate = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
    DEFAULT_COMPUTE_HOURLY_PRICE_USD,
  );

  return (
    <div>
      <SettingsRow
        label={t('label')}
        description={
          <>
            {t('session')} {t('separate')}
          </>
        }
      >
        <span className="text-sm whitespace-nowrap tabular-nums">{t('hourly', { rate })}</span>
      </SettingsRow>
      <div className="px-4 pb-3">
        <ComputeBillingDetails />
      </div>
    </div>
  );
}

/** Shared detail fold keeps purchase dialogs and the billing row concise. */
export function ComputeBillingDetails({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const t = useTranslations('billing.pricing.computer');
  const locale = useLocale();
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
  return (
    <Disclosure defaultOpen={defaultOpen}>
      <DisclosureTrigger>
        <Button variant="link" size="sm">
          {t('details')}
        </Button>
      </DisclosureTrigger>
      <DisclosureContent contentClassName="text-muted-foreground space-y-2 pt-2 text-xs">
        <p>{t('running')}</p>
        <p>
          {t('rate', {
            spec: DEFAULT_COMPUTE_SPEC,
            rate: money.format(DEFAULT_COMPUTE_HOURLY_PRICE_USD),
            credits: DEFAULT_COMPUTE_CREDITS_PER_HOUR,
          })}
        </p>
        <p>{t('concurrent', { concurrent: money.format(DEFAULT_COMPUTE_HOURLY_PRICE_USD * 3) })}</p>
        <p>{t('sleep')}</p>
        <p>{t('models')}</p>
      </DisclosureContent>
    </Disclosure>
  );
}
