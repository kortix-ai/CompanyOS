import { expect, test } from 'bun:test';
import { boundedAccounts, WHOAMI_ACCOUNTS_CAP } from './whoami.ts';
import type { AccountMembership } from '../api/types.ts';

const membership = (i: number): AccountMembership => ({ account_id: `acct-${i}`, slug: `s${i}`, name: `A ${i}`, role: 'member' });

// The MCP tool's reply must stay whole JSON even for a user with many
// accounts (the ke2e MCP-6 flow, 2026-11-09 release gate): the payload is
// bounded, the active account always leads, and a cut list names its total.
test('whoami --json bounds the accounts list: active first, total only when cut', () => {
  const many = Array.from({ length: 800 }, (_, i) => membership(i));
  const active = many[700]!;
  const { accounts, total } = boundedAccounts(many, active);
  expect(accounts).toHaveLength(WHOAMI_ACCOUNTS_CAP);
  expect(accounts[0]!.account_id).toBe('acct-700');
  expect(total).toBe(800);
});

test('a user under the cap keeps every account and no total field', () => {
  const few = [membership(0), membership(1), membership(2)];
  const { accounts, total } = boundedAccounts(few, few[1]);
  expect(accounts).toHaveLength(3);
  expect(accounts[0]!.account_id).toBe('acct-1');
  expect(total).toBeUndefined();
});

test('the same order and no total at the exact cap', () => {
  const exact = Array.from({ length: WHOAMI_ACCOUNTS_CAP }, (_, i) => membership(i));
  const { accounts, total } = boundedAccounts(exact, undefined);
  expect(accounts).toHaveLength(WHOAMI_ACCOUNTS_CAP);
  expect(accounts.map((a) => a.account_id)).toEqual(exact.map((a) => a.account_id));
  expect(total).toBeUndefined();
});
