/**
 * An account of a Kortix agent-identity connector needs no sign-in: Kortix
 * mints its credential, the account's empty encrypted state (./state.ts), the
 * first time the account is set up or used. Idempotent.
 */
import { resolveConnectionCredentialValue, upsertConnectionCredential } from '../credentials';
import type { KortixAgentService } from './host';
import { encodeAccountState } from './state';

export async function ensureKortixAgentAccount(input: {
  projectId: string;
  connectorId: string;
  connectionId: string;
  service: KortixAgentService;
}): Promise<string> {
  const existing = await resolveConnectionCredentialValue({ connectorId: input.connectorId, connectionId: input.connectionId });
  if (existing !== null) return existing;
  const value = encodeAccountState({ ...input, data: {} });
  // Lands only on a live account: minting never turns a revoked account back on.
  await upsertConnectionCredential({ ...input, value });
  return value;
}
