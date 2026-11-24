import { afterAll, beforeAll, expect, test } from 'bun:test';
import { accounts, connectorConnections, connectors, projects } from '@kortix/db';
import { eq } from 'drizzle-orm';
import { db } from '../shared/db';
import { dbConnectorRouterDeps } from './db-deps';
import { composioConnectionMetadata, mergeRequestingSession, takeRequestingSession } from './db-deps-connect';

const accountId = crypto.randomUUID();
const projectId = crypto.randomUUID();
const userId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const connectionId = crypto.randomUUID();

beforeAll(async () => {
  await db.insert(accounts).values({ accountId, name: 'connect-history' });
  await db.insert(projects).values({ projectId, accountId, name: 'connect-history', repoUrl: 'https://example.test/history.git' });
  const connectorId = crypto.randomUUID();
  await db.insert(connectors).values({ connectorId, accountId, projectId, slug: 'calendar', name: 'Calendar', providerType: 'composio', config: { app: 'googlecalendar' } });
  await db.insert(connectorConnections).values({ connectionId, connectorId, accountId, projectId, ownerType: 'project', label: 'Shared Calendar', metadata: { requesting_session_id: sessionId } });
});

afterAll(async () => {
  await db.delete(projects).where(eq(projects.projectId, projectId));
  await db.delete(accounts).where(eq(accounts.accountId, accountId));
});

async function listed(session: string) {
  const list = dbConnectorRouterDeps.listSessionConnectRequests;
  if (!list) throw new Error('missing session connect requests');
  return list(projectId, session, userId);
}

test('completion notifies once without removing the transcript card, including subsequent sessions', async () => {
  expect((await listed(sessionId)).map(row => row.connection_id)).toEqual([connectionId]);
  expect((await listed(sessionId))[0]?.connected).toBe(false);
  await db.update(connectorConnections).set({ metadata: {
    requesting_session_id: sessionId, provider: 'composio', toolkit: 'googlecalendar',
    connected_account_id: 'synthetic-authorized', connected_as: 'agent@kortix.ai',
  } }).where(eq(connectorConnections.connectionId, connectionId));
  const results = await Promise.all([takeRequestingSession(connectionId), takeRequestingSession(connectionId)]);
  expect(results.filter(Boolean)).toEqual([sessionId]);
  expect((await listed(sessionId)).map(row => row.connection_id)).toEqual([connectionId]);
  expect((await listed(sessionId))[0]).toMatchObject({ connected: true, connected_as: 'agent@kortix.ai' });
  expect(await takeRequestingSession(connectionId)).toBeNull();
  const nextSession = crypto.randomUUID();
  await mergeRequestingSession(connectionId, nextSession);
  expect(await takeRequestingSession(connectionId)).toBe(nextSession);
  expect((await listed(sessionId)).map(row => row.connection_id)).toEqual([connectionId]);
  expect((await listed(nextSession)).map(row => row.connection_id)).toEqual([connectionId]);
  expect(await listed(crypto.randomUUID())).toEqual([]);
  const [row] = await db.select({ metadata: connectorConnections.metadata }).from(connectorConnections)
    .where(eq(connectorConnections.connectionId, connectionId));
  const refreshed = composioConnectionMetadata({ toolkit: 'calendar', stableUserId: 'synthetic-user',
    sessionId: 'provider-session', isNoAuth: false, previous: row?.metadata });
  await db.update(connectorConnections).set({ metadata: refreshed }).where(eq(connectorConnections.connectionId, connectionId));
  expect((await listed(sessionId)).map(row => row.connection_id)).toEqual([connectionId]);
  await db.update(connectorConnections).set({ ownerType: 'member', ownerId: userId }).where(eq(connectorConnections.connectionId, connectionId));
  const list = dbConnectorRouterDeps.listSessionConnectRequests;
  if (!list) throw new Error('missing session connect requests');
  expect(await list(projectId, sessionId, crypto.randomUUID())).toEqual([]);
  expect((await listed(sessionId)).map(row => row.connection_id)).toEqual([connectionId]);
  await db.update(connectorConnections).set({ status: 'revoked' }).where(eq(connectorConnections.connectionId, connectionId));
  expect(await listed(sessionId)).toEqual([]);
});
