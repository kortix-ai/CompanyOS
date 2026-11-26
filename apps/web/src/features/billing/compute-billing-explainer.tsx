'use client';

import { useLocale, useTranslations } from '@/i18n/use-translations';
import { DEFAULT_COMPUTE_HOURLY_PRICE_USD } from '@kortix/ui/internal/billing/compute-pricing';
import { SettingsRow } from '@kortix/ui/settings-row';

/** A rate in the billing pane's existing definition list, not another card. */
export function ComputeBillingExplainer() {
  const t = useTranslations('billing.pricing.computer');
  const locale = useLocale();
  const rate = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(
    DEFAULT_COMPUTE_HOURLY_PRICE_USD,
  );

  return (
    <SettingsRow label={t('label')} description={t('session')}>
      <span className="text-sm whitespace-nowrap tabular-nums">{t('hourly', { rate })}</span>
    </SettingsRow>
  );
}
