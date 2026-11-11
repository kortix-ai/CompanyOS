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
