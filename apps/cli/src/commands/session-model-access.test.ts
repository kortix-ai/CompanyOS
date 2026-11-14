import { expect, test } from 'bun:test';
import { type ApiClient, ApiError } from '../api/client.ts';
import {
  type ModelPickerCatalog,
  connectedSubscriptionModels,
  requireConnectedModel,
} from './session-model-access.ts';

function mockClient(catalog: ModelPickerCatalog | Error): ApiClient {
  return {
    apiBase: 'https://api.kortix.test',
    get: async () => {
      if (catalog instanceof Error) throw catalog;
      return catalog;
    },
  } as unknown as ApiClient;
}

const subscriptionOnly: ModelPickerCatalog = {
  models: {},
  claudeSubscription: {
    connected: true,
    models: [
      { id: 'claude-agent/sonnet', connected: true, enabled: true },
      { id: 'claude-agent/opus', connected: true, enabled: false },
    ],
  },
};

test('subscription-only project passes the connected-model gate', async () => {
  await requireConnectedModel(mockClient(subscriptionOnly), 'proj_1');
});

test('gateway model passes the connected-model gate', async () => {
  await requireConnectedModel(mockClient({ models: { 'kortix/auto': {} } }), 'proj_1');
});

test('unconnected subscription group still fails the gate', async () => {
  await expect(
    requireConnectedModel(
      mockClient({
        models: {},
        claudeSubscription: {
          connected: false,
          models: [{ id: 'claude-agent/sonnet', connected: false, enabled: true }],
        },
      }),
      'proj_1',
    ),
  ).rejects.toThrow('No model connected');
});

test('empty catalog fails the gate', async () => {
  await expect(requireConnectedModel(mockClient({ models: {} }), 'proj_1')).rejects.toThrow(
    'No model connected',
  );
});

test('missing picker (404) passes the gate', async () => {
  await requireConnectedModel(mockClient(new ApiError(404, 'Not found')), 'proj_1');
});

test('other picker errors still throw', async () => {
  await expect(
    requireConnectedModel(mockClient(new ApiError(500, 'Server error')), 'proj_1'),
  ).rejects.toThrow('Server error');
});

test('connectedSubscriptionModels keeps connected models only', () => {
  expect(connectedSubscriptionModels(subscriptionOnly).map((model) => model.id)).toEqual([
    'claude-agent/sonnet',
    'claude-agent/opus',
  ]);
  expect(connectedSubscriptionModels({ models: {} })).toEqual([]);
  expect(
    connectedSubscriptionModels({
      models: {},
      claudeSubscription: { connected: false, models: [{ id: 'claude-agent/sonnet' }] },
    }),
  ).toEqual([]);
});
