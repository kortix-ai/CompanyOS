/**
 * Pure helpers for the call log columns of `connector_calls`.
 * See `@kortix/api-contract/tool-calls` for the vocabulary.
 */
import type { CallPhase } from '@kortix/api-contract/tool-calls';

const ACCOUNT_REASONS = new Set([
  'account_required',
  'account_not_found',
  'connector_not_connected',
  'computer_unpaired',
  'computer_owner_left',
  'computer_offline',
]);

/**
 * The step a call stopped at, from its status and machine reason.
 * Unknown denial reasons count as `policy`: something in Kortix refused it.
 */
export function callPhaseOf(status: string, reason: string | null): CallPhase {
  if (status === 'ok') return 'done';
  if (status === 'pending_approval' || status === 'approved' || status === 'expired') return 'approval';
  const r = reason ?? '';
  if (r.startsWith('approval_') || r === 'request_changed' || r === 'previously_denied') return 'approval';
  if (ACCOUNT_REASONS.has(r)) return 'account';
  if (r === 'needs_auth' || r.startsWith('credential_') || r === 'composio_connection_missing') return 'credential';
  if (r.startsWith('connector_') || r === 'action_not_found' || r === 'not_granted') return 'grant';
  if (status === 'error') return 'upstream';
  return 'policy';
}
