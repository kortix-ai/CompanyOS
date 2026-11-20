import { beforeEach, expect, mock, test } from 'bun:test';
import type { getCreditAccount } from '../repositories/credit-accounts';
let row: Partial<Awaited<ReturnType<typeof getCreditAccount>>> | null = null;
let customers: string[] = [];
let failure = false;
let pages = [{ data: [{ id: 'sub_synthetic', status: 'active' }], has_more: false }];
let reads = 0;
let keyedWorkspace = false;
const realAccounts = await import('../repositories/credit-accounts');
const realCustomers = await import('../repositories/customers');
const realResolve = await import('../../shared/resolve-account');
mock.module('../../shared/resolve-account', () => ({ ...realResolve, accountExists: async () => keyedWorkspace }));
mock.module('../repositories/credit-accounts', () => ({ ...realAccounts, getCreditAccount: async () => { if (failure) throw new Error('read failed'); return row; } }));
mock.module('../repositories/customers', () => ({ ...realCustomers, listStripeCustomerIdsByAccountId: async () => customers }));
mock.module('../../shared/stripe', () => ({ getStripe: () => ({ subscriptions: { list: async () => { const page = pages[reads++]; if (!page) throw new Error('provider failed'); return page; } } }) }));
const { buildWorkspacelessAccountState } = await import('./account-state');
beforeEach(() => { keyedWorkspace = false; row = null; customers = []; failure = false; reads = 0; pages = [{ data: [{ id: 'sub_synthetic', status: 'active' }], has_more: false }]; });
test('an empty identity has no subscription and creates no wallet', async () => {
  expect(await buildWorkspacelessAccountState('synthetic')).toMatchObject({ billing_state: 'no_account', has_active_subscription: false });
  expect(reads).toBe(0);
});
test('a mapped active subscription cannot be reported absent even without a wallet', async () => {
  customers = ['cus_synthetic'];
  expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(true);
});
test('ended recurring billing is distinct from an active subscription', async () => {
  customers = ['cus_synthetic']; pages[0].data[0].status = 'canceled';
  expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(false);
});
test('pagination checks every subscription page', async () => {
  customers = ['cus_synthetic'];
  pages = [{ data: [{ id: 'sub_old', status: 'canceled' }], has_more: true }, { data: [{ id: 'sub_live', status: 'past_due' }], has_more: false }];
  expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(true);
  expect(reads).toBe(2);
});
test('database errors propagate instead of declaring no subscription', async () => {
  failure = true;
  await expect(buildWorkspacelessAccountState('synthetic')).rejects.toThrow('read failed');
});
test('provider errors propagate instead of declaring no subscription', async () => {
  customers = ['cus_synthetic']; pages = [];
  await expect(buildWorkspacelessAccountState('synthetic')).rejects.toThrow('provider failed');
});

test('a nonrecurring wallet is not a subscription', async () => {
  row = { tier: 'free', balance: '20', lifetimePurchased: '20' };
  expect(await buildWorkspacelessAccountState('synthetic')).toMatchObject({ billing_state: 'no_subscription', has_active_subscription: false });
});
for (const status of ['active', 'trialing', 'past_due', 'unpaid', null]) {
  test(`a stored subscription with status ${status} stays fail-closed`, async () => {
    row = { stripeSubscriptionId: 'sub_synthetic', stripeSubscriptionStatus: status };
    expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(true);
  });
}
test('a store subscription remains visible without a workspace', async () => {
  row = { revenuecatSubscriptionId: 'store_synthetic' };
  expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(true);
});
test('a pending store cancellation stays active until it expires', async () => {
  row = { revenuecatSubscriptionId: 'store_synthetic', revenuecatCancelledAt: '2026-01-01T00:00:00Z', revenuecatCancelAtPeriodEnd: '2099-01-01T00:00:00Z' };
  expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(true);
});
test('a store cancellation with no known expiry stays fail-closed', async () => {
  row = { revenuecatSubscriptionId: 'store_synthetic', revenuecatCancelledAt: '2026-01-01T00:00:00Z' };
  expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(true);
});
test('an expired store cancellation is no longer a subscription', async () => {
  row = { revenuecatSubscriptionId: 'store_synthetic', revenuecatCancelledAt: '2026-01-01T00:00:00Z', revenuecatCancelAtPeriodEnd: '2026-02-01T00:00:00Z' };
  expect((await buildWorkspacelessAccountState('synthetic')).has_active_subscription).toBe(false);
});
test('a workspace the person left that is keyed by their id is refused, not read', async () => {
  keyedWorkspace = true; row = { stripeSubscriptionId: 'sub_synthetic', stripeSubscriptionStatus: 'active' };
  await expect(buildWorkspacelessAccountState('synthetic')).rejects.toMatchObject({ status: 409, code: 'no_workspace' });
});
