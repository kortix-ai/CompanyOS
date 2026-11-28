import { expect, test } from 'bun:test';
import type { AdminConnector } from '@kortix/sdk';

import {
  ONBOARDING_APPS,
  appConnector,
  firstOnboardingStep,
  normalizeDomain,
  profileToSave,
} from './workspace-onboarding-steps';

test('a workspace with no saved answer opens on the profile', () => {
  expect(firstOnboardingStep({})).toBe('profile');
});

test('any saved answer resumes the wizard past the profile, on any device', () => {
  expect(firstOnboardingStep({ use_case: 'engineering' })).toBe('model');
  expect(firstOnboardingStep({ company_size: '1-10' })).toBe('model');
  expect(firstOnboardingStep({ company_domain: 'acme.com' })).toBe('model');
});

test('a pasted website is cut down to its domain', () => {
  expect(normalizeDomain('  https://www.Acme.com/about?x=1 ')).toBe('acme.com');
  expect(normalizeDomain('acme.io')).toBe('acme.io');
  expect(normalizeDomain('http://sub.acme.co.uk#top')).toBe('sub.acme.co.uk');
  expect(normalizeDomain('   ')).toBe('');
});

test('only answered fields are sent: an empty string never reaches the API', () => {
  expect(profileToSave({ use_case_note: '  ', company_domain: ' ' })).toEqual({});
  expect(
    profileToSave({
      use_case: 'sales',
      use_case_note: 'ignored without other',
      company_size: '11-50',
      company_domain: 'https://acme.com/',
    }),
  ).toEqual({ use_case: 'sales', company_size: '11-50', company_domain: 'acme.com' });
});

test('the note is sent with "other" only, trimmed', () => {
  expect(profileToSave({ use_case: 'other', use_case_note: '  Research lab ', company_domain: '' })).toEqual({
    use_case: 'other',
    use_case_note: 'Research lab',
  });
});

function connector(partial: Partial<AdminConnector>): AdminConnector {
  return {
    slug: 'x',
    name: 'X',
    provider: 'composio',
    status: 'active',
    credentialMode: 'shared',
    authorizationStrategy: 'project',
    sensitive: false,
    actions: [],
    authSecret: null,
    secretSet: false,
    ...partial,
  };
}

test('an app is matched to the Composio connector named after it, not to a lookalike', () => {
  const github = ONBOARDING_APPS.find((app) => app.slug === 'github')!;
  const connectors = [
    connector({ slug: 'github-mcp', name: 'GitHub', provider: 'mcp' }),
    connector({ slug: 'github-x1', name: 'GitHub', provider: 'composio' }),
  ];
  expect(appConnector(connectors, github)?.slug).toBe('github-x1');
  expect(appConnector([connector({ name: 'GitLab' })], github)).toBeUndefined();
});
