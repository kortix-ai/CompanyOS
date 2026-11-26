import { DEFAULT_COMPUTE_HOURLY_PRICE_USD } from '@kortix/ui/internal/billing/compute-pricing';
import { describe, expect, test } from 'bun:test';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '../../../translations/en.json';
import { ComputeBillingDetails, ComputeBillingExplainer } from './compute-billing-explainer';

describe('computer billing rate row', () => {
  test('shows an aligned rate with default-size caveats and access to billing details', () => {
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
    expect(text).toContain('Default size. Models and storage billed separately.');
    expect(html).toContain('aria-expanded="false"');
    expect(text).toContain('How billing works');
    expect(html).toContain('tabular-nums');
    expect((html.match(/<p\b/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

test('expanded billing details explain reserved resources, concurrency, sleep and model exceptions', () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
      <ComputeBillingDetails defaultOpen />
    </NextIntlClientProvider>,
  );
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const fact of [
    'including idle time',
    'Billed per second for reserved resources',
    '2 vCPU / 4 GB / 20 GB',
    '3 computers × 1 hour = 3 computer-hours',
    'Sleep stops compute charges',
    'Stored files can still incur storage charges',
    'ChatGPT subscription has no Kortix model-call charge',
    'applicable Kortix BYOK fee',
  ]) {
    expect(text).toContain(fact);
  }
  expect(text).toContain(
    new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(
      DEFAULT_COMPUTE_HOURLY_PRICE_USD * 3,
    ),
  );
  expect(html).toContain('aria-expanded="true"');
});
