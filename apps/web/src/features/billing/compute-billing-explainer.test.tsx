import { DEFAULT_COMPUTE_HOURLY_PRICE_USD } from '@kortix/ui/internal/billing/compute-pricing';
import { describe, expect, test } from 'bun:test';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '../../../translations/en.json';
import { ComputeBillingExplainer } from './compute-billing-explainer';

describe('computer billing explanation', () => {
  test('keeps the hourly computer price visible and secondary detail collapsed', () => {
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
    expect(text).toContain('Each session runs a computer');
    expect(text).toContain('Models and storage billed separately');
    expect(text).toContain('How billing works');

    expect(text).not.toContain('3 computers × 1 hour');
    expect(text).not.toContain('including idle time');
  });
});
