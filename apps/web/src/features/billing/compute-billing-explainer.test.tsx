import { DEFAULT_COMPUTE_HOURLY_PRICE_USD } from '@kortix/ui/internal/billing/compute-pricing';
import { describe, expect, test } from 'bun:test';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '../../../translations/en.json';
import { ComputeBillingExplainer } from './compute-billing-explainer';

describe('computer billing rate row', () => {
  test('shows one aligned hourly rate without a disclosure or paragraph wall', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
        <ComputeBillingExplainer />
      </NextIntlClientProvider>,
    );
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const rate = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(
      DEFAULT_COMPUTE_HOURLY_PRICE_USD,
    );
    expect(text).toContain(rate);
    expect(text).toContain('Cloud computer');
    expect(text).toContain('Each session, including connector tasks');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('aria-expanded');
    expect(text).not.toContain('How billing works');
    expect(html).toContain('tabular-nums');
    expect((html.match(/<p\b/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
