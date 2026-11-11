import { describe, expect, test } from 'bun:test';

import { isMultiUseCredentialName, knownSecretApiHosts } from './secret-api-hosts';

const CATALOG = [
  { id: 'anthropic', apiHost: null, envVars: ['ANTHROPIC_API_KEY'] },
  { id: 'deepseek', apiHost: 'api.deepseek.com', envVars: ['DEEPSEEK_API_KEY'] },
  { id: 'google', apiHost: null, envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  { id: 'coding-assistant', apiHost: 'api.assistant.test', envVars: ['GITHUB_TOKEN'] },
  { id: 'no-host', apiHost: null, envVars: ['NO_HOST_API_KEY'] },
];

describe('knownSecretApiHosts', () => {
  test('reads the catalog host for a provider env var', () => {
    expect(knownSecretApiHosts('DEEPSEEK_API_KEY', CATALOG)).toEqual(['api.deepseek.com']);
  });

  test('falls back to the curated host when the catalog declares none', () => {
    expect(knownSecretApiHosts('ANTHROPIC_API_KEY', CATALOG)).toEqual(['api.anthropic.com']);
    expect(knownSecretApiHosts('GEMINI_API_KEY', CATALOG)).toEqual([
      'generativelanguage.googleapis.com',
    ]);
  });

  test('answers the curated names with no catalog at all', () => {
    expect(knownSecretApiHosts('OPENAI_API_KEY')).toEqual(['api.openai.com']);
    expect(knownSecretApiHosts('anthropic_api_key')).toEqual(['api.anthropic.com']);
  });

  test('a provider with no host and no fallback answers nothing', () => {
    expect(knownSecretApiHosts('NO_HOST_API_KEY', CATALOG)).toEqual([]);
  });

  test('an unknown name answers nothing', () => {
    expect(knownSecretApiHosts('STRIPE_API_KEY', CATALOG)).toEqual([]);
    expect(knownSecretApiHosts('', CATALOG)).toEqual([]);
  });

  test('a multi-use name never answers, whatever the catalog claims', () => {
    expect(knownSecretApiHosts('GITHUB_TOKEN', CATALOG)).toEqual([]);
    expect(knownSecretApiHosts('GOOGLE_API_KEY', CATALOG)).toEqual([]);
    expect(knownSecretApiHosts('AWS_SECRET_ACCESS_KEY', CATALOG)).toEqual([]);
  });
});

describe('isMultiUseCredentialName', () => {
  test('matches exact names and the vendor prefixes, case-insensitively', () => {
    expect(isMultiUseCredentialName('gh_token')).toBe(true);
    expect(isMultiUseCredentialName('AZURE_OPENAI_API_KEY')).toBe(true);
    expect(isMultiUseCredentialName('OPENAI_API_KEY')).toBe(false);
  });
});

describe('knownSecretApiHosts — catalog review', () => {
  const REVIEW_CATALOG = [
    { id: 'regional', apiHost: 'api.vendor.ai', envVars: ['REGIONAL_API_KEY'] },
    { id: 'regional-cn', apiHost: 'api.vendor.cn', envVars: ['REGIONAL_API_KEY'] },
    { id: 'templated', apiHost: '${account}.warehouse.test', envVars: ['TEMPLATED_API_KEY'] },
    { id: 'config', apiHost: 'api.config.test', envVars: ['CONFIG_API_KEY', 'CONFIG_REGION', 'CONFIG_BASE_URL'] },
    { id: 'tracker', apiHost: 'api.tracker.test', envVars: ['WANDB_API_KEY'] },
  ];

  test('a name two regional providers declare maps to both hosts', () => {
    expect(knownSecretApiHosts('REGIONAL_API_KEY', REVIEW_CATALOG)).toEqual(['api.vendor.ai', 'api.vendor.cn']);
  });

  test('a templated catalog host maps to nothing', () => {
    expect(knownSecretApiHosts('TEMPLATED_API_KEY', REVIEW_CATALOG)).toEqual([]);
  });

  test('a configuration name beside a credential maps to nothing', () => {
    expect(knownSecretApiHosts('CONFIG_API_KEY', REVIEW_CATALOG)).toEqual(['api.config.test']);
    expect(knownSecretApiHosts('CONFIG_REGION', REVIEW_CATALOG)).toEqual([]);
    expect(knownSecretApiHosts('CONFIG_BASE_URL', REVIEW_CATALOG)).toEqual([]);
  });

  test('every reviewed multi-use name maps to nothing', () => {
    for (const name of [
      'WANDB_API_KEY',
      'DATABRICKS_TOKEN',
      'DIGITALOCEAN_ACCESS_TOKEN',
      'VULTR_API_KEY',
      'NVIDIA_API_KEY',
      'HF_TOKEN',
      'GITLAB_TOKEN',
      'AWS_BEARER_TOKEN_BEDROCK',
      'AZURE_API_KEY',
    ]) {
      expect(isMultiUseCredentialName(name)).toBe(true);
      expect(knownSecretApiHosts(name, REVIEW_CATALOG)).toEqual([]);
    }
  });
});
