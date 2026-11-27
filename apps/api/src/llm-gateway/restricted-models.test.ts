import { describe, expect, test } from 'bun:test';
import { RESTRICTED_MANAGED_MODEL_IDS, isRestrictedManagedModelId, readRestrictedModelGrants } from './restricted-models';

describe('restricted managed models', () => {
  test('the abliterated models are restricted; the lineup and the voice models are not', () => {
    expect(RESTRICTED_MANAGED_MODEL_IDS).toEqual(['kimi-k3.1-pro-abliterated', 'deepseek-v4.1-flash-abliterated']);
    for (const id of ['kimi-k3.1-pro', 'deepseek-v4.1-flash', 'qwen3.8-27b', 'gemini-3.5-flash-lite']) {
      expect(isRestrictedManagedModelId(id)).toBe(false);
    }
  });

  test('a grant reads only restricted ids from metadata.restricted_models', () => {
    expect(readRestrictedModelGrants(null)).toEqual([]);
    expect(readRestrictedModelGrants({})).toEqual([]);
    expect(readRestrictedModelGrants({ restricted_models: 'kimi-k3.1-pro-abliterated' })).toEqual([]);
    expect(readRestrictedModelGrants({ restricted_models: ['kimi-k3.1-pro-abliterated', 'kimi-k3.1-pro', 'x'] }))
      .toEqual(['kimi-k3.1-pro-abliterated']);
    // A workspace's own model settings never grant one.
    expect(readRestrictedModelGrants({ model_access: { disabledModels: [] }, restricted_models: [] })).toEqual([]);
  });
});
