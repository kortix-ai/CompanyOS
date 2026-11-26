import { beforeEach, expect, mock, test } from 'bun:test';

const PROJECT = '00000000-0000-4000-a000-000000001502';
const CONNECTION = '00000000-0000-4000-a000-000000001503';
let applied = false;
const revoke = mock(async () => applied ? [{ connectionId: CONNECTION }] : []);
const disable = mock(async (_id: string, _enabled: boolean) => {});
const oauthRevoke = mock(async () => {});
const reconcile = mock(async () => {});

const mutation = await import('../lib/connection-mutation');
mock.module('../lib/connection-mutation', () => ({
  ...mutation,
  loadMutableConnection: async () => ({
    loaded: { row: { accountId: PROJECT } },
    connection: {
      connectionId: CONNECTION, providerType: 'composio',
      metadata: { connected_account_id: 'synthetic-provider-account' },
    },
  }),
}));
const status = await import('../../connectors/connection-status');
mock.module('../../connectors/connection-status', () => ({ ...status, revokeConnections: revoke }));
const composio = await import('../../connectors/composio');
mock.module('../../connectors/composio', () => ({ ...composio, setComposioConnectedAccountEnabled: disable }));
const oauth = await import('../../connectors/oauth2-store');
mock.module('../../connectors/oauth2-store', () => ({ ...oauth, revokeConnectionOAuth2: oauthRevoke }));
const subscriptions = await import('../trigger-events/subscriptions');
mock.module('../trigger-events/subscriptions', () => ({ ...subscriptions, reconcileEventSubscriptionsFromCatalog: reconcile }));
const { projectsApp } = await import('../lib/app');
(await import('./connection-actions')).registerConnectionActionsRoutes();

beforeEach(() => {
  applied = false;
  revoke.mockClear();
  disable.mockClear();
  oauthRevoke.mockClear();
  reconcile.mockClear();
});

async function request(pendingOnly: boolean) {
  const response = await projectsApp.request(`/${PROJECT}/connections/${CONNECTION}/revoke`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pending_only: pendingOnly }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
}

test('pending-only revoke preserves provider when authorization already completed', async () => {
  await request(true);
  expect(revoke).toHaveBeenCalledTimes(1);
  expect(disable).not.toHaveBeenCalled();
  expect(oauthRevoke).not.toHaveBeenCalled();
  expect(reconcile).not.toHaveBeenCalled();
});

test('an applied revoke disables the provider', async () => {
  applied = true;
  await request(true);
  expect(disable).toHaveBeenCalledWith('synthetic-provider-account', false);
  expect(reconcile).toHaveBeenCalledTimes(1);
});

test('ordinary disconnect still revokes OAuth and disables the provider', async () => {
  applied = true;
  await request(false);
  expect(oauthRevoke).toHaveBeenCalledWith(CONNECTION);
  expect(disable).toHaveBeenCalledWith('synthetic-provider-account', false);
});
