
/**
 * The credit ledger row model and its labels, shared by every ledger view.
 *
 * Account settings (Usage → Credit ledger) feeds it from
 * `GET /billing/transactions`; the admin account sheet feeds it from
 * `GET /admin/api/accounts/{id}/ledger`. Both are the same `credit_ledger`
 * rows, and both render through `CreditActivityFeed`, so an operator looking
 * at a support ticket sees exactly what the customer sees. The badge labels
 * live with the feed (`credit-activity-feed.tsx`) — that is where they
 * localize.
 *
 * The admin adapter lives in `app/admin/accounts/ledger-rows.ts`.
 */

import { formatUsdAsCredits } from '@kortix/shared';

/** One `credit_ledger` row, normalized across the two endpoints. */
export interface CreditTransactionRow {
  id: string;
  /** ISO-8601, or null when the source has no timestamp. */
  createdAt: string | null;
  /** Raw ledger type, e.g. `admin_grant` — labelled by `creditTransactionBadge` in `credit-activity-feed.tsx`. */
  type: string;
  description: string | null;
  /** Absent = the source does not say, and the Credit type cell stays empty. */
  isExpiring?: boolean;
  expiresAt?: string | null;
  amount: number;
  balanceAfter: number;
}

/**
 * A ledger amount in credits with its sign: `+2,500`, `-125`. A debit too
 * small to show reads `<0.01` with no sign (`-<0.01` is two symbols for one
 * idea); a credit that small keeps its `+`, so a tiny refund and a tiny
 * charge still read differently.
 */
export function formatSignedCredits(usd: number): string {
  const magnitude = formatUsdAsCredits(Math.abs(usd));
  if (magnitude.startsWith('<')) return usd > 0 ? `+${magnitude}` : magnitude;
  return `${usd < 0 && magnitude !== '0' ? '-' : '+'}${magnitude}`;
}
