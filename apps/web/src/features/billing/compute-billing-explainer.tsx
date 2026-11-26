'use client';

import { useLocale, useTranslations } from '@/i18n/use-translations';
import {
  DEFAULT_COMPUTE_CREDITS_PER_HOUR,
  DEFAULT_COMPUTE_HOURLY_PRICE_USD,
  DEFAULT_COMPUTE_SPEC,
} from '@kortix/ui/internal/billing/compute-pricing';

/** The same billing unit beside pricing, purchase choices, and balances. */
export function ComputeBillingExplainer() {
  const t = useTranslations('billing.pricing.computer');
  const locale = useLocale();
  const usd = (amount: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(amount);
  const facts = {
    rate: usd(DEFAULT_COMPUTE_HOURLY_PRICE_USD),
    credits: DEFAULT_COMPUTE_CREDITS_PER_HOUR,
    spec: DEFAULT_COMPUTE_SPEC,
    concurrent: usd(DEFAULT_COMPUTE_HOURLY_PRICE_USD * 3),
  };

  return (
    <section className="space-y-3" aria-label={t('title')}>
      <h3 className="text-foreground text-sm font-medium">{t('title')}</h3>
      <p className="text-muted-foreground text-sm text-pretty">{t('running')}</p>
      <p className="text-foreground text-sm tabular-nums">{t('rate', facts)}</p>
      <p className="text-muted-foreground text-sm text-pretty">{t('concurrent', facts)}</p>
      <p className="text-muted-foreground text-xs text-pretty">{t('sleep')}</p>
      <p className="text-muted-foreground text-xs text-pretty">{t('models')}</p>
    </section>
  );
}
