/**
 * The credential of a Kortix agent-identity account IS its state: the TOTP
 * secrets of an authenticator, the browser id of a browser, the number of a
 * phone. Encrypted with the workspace's secret key and stored as the
 * account's connection credential. The gateway sends it as the Bearer on every
 * call; the server decrypts it, and a tool that changes the state writes the
 * new value back to the same credential row. It is never returned to a model.
 *
 *   ka1.<workspace id>.<encryptProjectSecret(workspace id, JSON)>
 *
 * Every session of an account can call it at once (one browser, many
 * sessions), so a change is a read-modify-write under the connection's row
 * lock ({@link updateAccountState}), never a blind overwrite.
 */
import { and, eq, sql } from 'drizzle-orm';
import { connectionCredentials, connectorConnections } from '@kortix/db';
import { decryptProjectSecret, encryptProjectSecret } from '../../projects/surface';
import { db } from '../../shared/db';
import { ConnectionRevokedError } from '../credentials';
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

export type StateMutation<D> = (data: D) => D;
type StateStore = <D>(state: AccountState<D>, mutate: StateMutation<D>) => Promise<AccountState<D>>;

/**
 * Apply `mutate` to the account's CURRENT stored state and write the result,
 * under the connection row's lock: two calls at once both land. A revoked
 * account refuses (`ConnectionRevokedError`) and stays revoked.
 */
const updateStored: StateStore = (state, mutate) =>
  db.transaction(async (tx) => {
    const [connection] = await tx
      .select({ status: connectorConnections.status })
      .from(connectorConnections)
      .where(and(eq(connectorConnections.connectionId, state.connectionId), eq(connectorConnections.connectorId, state.connectorId)))
      .for('update')
      .limit(1);
    if (!connection || connection.status === 'revoked') throw new ConnectionRevokedError(state.connectionId);
    const [row] = await tx
      .select({ valueEnc: connectionCredentials.valueEnc })
      .from(connectionCredentials)
      .where(eq(connectionCredentials.connectionId, state.connectionId))
      .limit(1);
    // The stored row is the truth; the Bearer this call carried may be a few writes old.
    const current = row ? (decodeAccountState(decryptProjectSecret(state.projectId, row.valueEnc), state.service) as typeof state) : state;
    const next = { ...current, data: mutate(current.data) };
    // The credential column holds the token encrypted once more, as every connection credential is.
    const valueEnc = encryptProjectSecret(state.projectId, encodeAccountState(next as AccountState));
    if (row) {
      await tx.update(connectionCredentials).set({ valueEnc, updatedAt: sql`now()` }).where(eq(connectionCredentials.connectionId, state.connectionId));
    } else {
      await tx.insert(connectionCredentials).values({ connectorId: state.connectorId, connectionId: state.connectionId, userId: null, kind: 'secret', valueEnc });
    }
    return next;
  });

let store: StateStore = updateStored;

/** Tests replace the store; never called in production. */
export function setAccountStateStoreForTests(fn: StateStore | null): void {
  store = fn ?? updateStored;
}

/** Change an account's state atomically; returns the state as written. */
export function updateAccountState<D>(state: AccountState<D>, mutate: StateMutation<D>): Promise<AccountState<D>> {
  return store(state, mutate);
}
