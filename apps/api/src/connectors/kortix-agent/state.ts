/**
 * The credential of a Kortix agent-identity account IS its state: the TOTP
 * secrets of an authenticator, the browser id of a browser, the number of a
 * phone. Encrypted with the workspace's secret key and stored as the
 * account's connection credential. The gateway sends it as the Bearer on every
 * call; the server decrypts it, and a tool that changes the state writes the
 * new value back to the same credential row. It is never returned to a model.
 *
 *   ka1.<workspace id>.<encryptProjectSecret(workspace id, JSON)>
 */
import { decryptProjectSecret, encryptProjectSecret } from '../../projects/surface';
import { upsertConnectionCredential } from '../credentials';
import type { KortixAgentService } from './host';

const PREFIX = 'ka1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccountState<D = Record<string, unknown>> {
  projectId: string;
  connectorId: string;
  connectionId: string;
  service: KortixAgentService;
  data: D;
}

export class InvalidAccountToken extends Error {}

export function encodeAccountState(state: AccountState): string {
  const { projectId, ...rest } = state;
  return `${PREFIX}.${projectId}.${encryptProjectSecret(projectId, JSON.stringify(rest))}`;
}

/** The state a Bearer carries. Throws {@link InvalidAccountToken} for anything else. */
export function decodeAccountState(token: string, service: KortixAgentService): AccountState {
  const [prefix, projectId, ...rest] = token.split('.');
  const sealed = rest.join('.');
  if (prefix !== PREFIX || !projectId || !UUID.test(projectId) || !sealed) throw new InvalidAccountToken('not a Kortix agent account credential');
  let parsed: Omit<AccountState, 'projectId'>;
  try {
    parsed = JSON.parse(decryptProjectSecret(projectId, sealed));
  } catch {
    throw new InvalidAccountToken('the account credential could not be read');
  }
  if (parsed.service !== service) throw new InvalidAccountToken(`this credential belongs to the ${parsed.service} connector`);
  if (!UUID.test(parsed.connectorId ?? '') || !UUID.test(parsed.connectionId ?? '')) throw new InvalidAccountToken('the account credential names no account');
  return { projectId, ...parsed, data: parsed.data ?? {} };
}

// No `startedAt` and no `connectNow`: the write lands only on a live account,
// so a revoke always wins and the account stays revoked.
const writeCredential = async (state: AccountState): Promise<void> => {
  await upsertConnectionCredential({
    projectId: state.projectId,
    connectorId: state.connectorId,
    connectionId: state.connectionId,
    value: encodeAccountState(state),
  });
};
let persist = writeCredential;

/** Tests replace the credential write; never called in production. */
export function setAccountStatePersistForTests(fn: ((state: AccountState) => Promise<void>) | null): void {
  persist = fn ?? writeCredential;
}

/** Write an account's new state to its credential. */
export function saveAccountState(state: AccountState): Promise<void> {
  return persist(state);
}
