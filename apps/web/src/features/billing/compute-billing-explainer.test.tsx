import { DEFAULT_COMPUTE_HOURLY_PRICE_USD } from '@kortix/ui/internal/billing/compute-pricing';
import { describe, expect, test } from 'bun:test';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '../../../translations/en.json';
import { ComputeBillingExplainer } from './compute-billing-explainer';

describe('computer billing explanation', () => {
  test('renders reserved-resource price and additive computer hours, not an all-in model price', () => {
    const text = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
        <ComputeBillingExplainer />
      </NextIntlClientProvider>,
    )
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    const usd = (value: number) =>
      new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(value);
    expect(text).toContain(usd(DEFAULT_COMPUTE_HOURLY_PRICE_USD));
    expect(text).toContain(usd(DEFAULT_COMPUTE_HOURLY_PRICE_USD * 3));
    expect(text).toContain('3 computers × 1 hour = 3 computer-hours');
    expect(text).toContain('Billed per second for reserved resources');
    expect(text).toContain('Model usage and stored files are extra');
    expect(text).toContain('no Kortix model-call charge; computer charges still apply');
    expect(text).toContain('you pay your provider, plus any applicable Kortix BYOK fee');
    expect(text).not.toContain('15 minutes');
  });
});
