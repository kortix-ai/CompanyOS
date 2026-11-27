/**
 * Restricted managed models (restricted-models.ts) in the picker: listed for a
 * project only once an operator turned them on for it, on by default then, and
 * never for an account without managed models.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

let restrictedModels: string[] = [];
let managedAllowed = true;

mock.module('../../repositories/project-model-access', () => ({
  getProjectModelAccess: async () => ({ disabledProviders: [], disabledModels: [] }),
  getProjectGatewayResolution: async () => ({
    access: { disabledProviders: [], disabledModels: [] }, customProviders: [], restrictedModels,
  }),
}));
mock.module('../../billing/services/entitlements', () => ({
  accountMayUseManagedModels: async () => managedAllowed,
  getCachedAccountTier: async () => 'pro',
  getAccountTier: async () => 'pro',
}));
mock.module('../credentials/gateway-keys', () => ({
  connectedGatewayKeyNames: async () => new Set<string>(),
  defaultableGatewayKeyNames: async () => new Set<string>(),
  firstGatewayKeyValue: async () => null,
}));
mock.module('../../repositories/model-preferences', () => ({
  getAccountModelDefaults: async () => ({ account: null, agents: {}, projects: {} }),
}));
mock.module('../../repositories/project-routing-policies', () => ({
  getProjectRoutingPolicy: async () => null,
}));
const realCatalog = await import('./catalog-models');
mock.module('./catalog-models', () => ({ ...realCatalog, gatewayModelCatalog: () => ({}) }));
const realDescriptors = await import('../resolution/descriptors');
mock.module('../resolution/descriptors', () => ({ ...realDescriptors, managedTransportAvailable: () => true }));

const { __setManagedLineupForTest } = await import('./managed-models');
type ManagedModel = import('./managed-models').ManagedModel;
const { servableProjectCatalog } = await import('./servable-catalog');

const abliterated = (id: string, name: string): ManagedModel => ({
  id, name, vision: true, limit: { context: 1_048_576, output: 131_072 },
  pricing: { inputPerMillion: 6, outputPerMillion: 34, cachedInputPerMillion: 0.7 }, private: true,
});

const listed = async () => Object.entries((await servableProjectCatalog({ projectId: 'p1', accountId: 'a1', principalUserId: 'u1' })).models);

describe('restricted managed models in the picker', () => {
  beforeEach(() => {
    restrictedModels = [];
    managedAllowed = true;
    __setManagedLineupForTest([
      abliterated('kimi-k3.1-pro-abliterated', 'Kimi K3.1 Pro Abliterated'),
      abliterated('deepseek-v4.1-flash-abliterated', 'DeepSeek V4.1 Flash Abliterated'),
    ]);
  });

  test('a project nobody turned them on for lists neither', async () => {
    expect((await listed()).map(([id]) => id).filter((id) => id.includes('abliterated'))).toEqual([]);
  });

  test('a granted project lists exactly the granted one, enabled, at its price', async () => {
    restrictedModels = ['kimi-k3.1-pro-abliterated'];
    const rows = (await listed()).filter(([id]) => id.includes('abliterated'));
    expect(rows.map(([id]) => id)).toEqual(['kimi-k3.1-pro-abliterated']);
    expect(rows[0]![1]).toMatchObject({ enabled: true, provider: 'kortix', cost: { input: 6, output: 34, cache_read: 0.7 } });
  });

  test('an account without managed models lists none, granted or not', async () => {
    restrictedModels = ['kimi-k3.1-pro-abliterated', 'deepseek-v4.1-flash-abliterated'];
    managedAllowed = false;
    expect((await listed()).map(([id]) => id).filter((id) => id.includes('abliterated'))).toEqual([]);
  });
});
