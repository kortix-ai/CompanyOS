import { describe, expect, test } from 'bun:test';
import type { AdminConnector } from '@kortix/sdk';

import type { SecretRow } from '../../customize/sections/view/secrets-view';
import { setupSteps, slackNeeded } from './setup-steps';

// The setup page and `kortix onboard --wait` must agree on what is left: these
// are the page's rules for which steps exist and which are done.
const connector = (slug: string, fields: Partial<AdminConnector>): AdminConnector =>
  ({ slug, name: slug, provider: 'mcp', status: 'active', ...fields }) as AdminConnector;
const secret = (key: string, requirement: SecretRow['requirement'], configured: boolean): SecretRow =>
  ({ identifier: key, key, requirement, configured }) as SecretRow;

describe('setupSteps', () => {
  test('lists declared sign-in connectors, required secrets and Slack; open steps first', () => {
    const steps = setupSteps({
      connectors: [
        connector('linear', { state: 'connected' }),
        connector('supabase', { state: 'needs_account', status: 'needs_auth' }),
        connector('vercel', { state: 'error', status: 'error' }),
        connector('kortix_slack', { provider: 'channel', platform: 'slack' }),
        connector('computer', { provider: 'computer' }),
        connector('off', { status: 'disabled', state: 'disabled' }),
      ],
      secrets: [secret('FACTORY_GITHUB_TOKEN', 'required', false), secret('OPTIONAL_KEY', 'optional', false), secret('WEBHOOK', 'required', true)],
      slack: { needed: true, installed: false },
      slackName: 'Slack',
    });
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ['connector:supabase', false],
      ['connector:vercel', false],
      ['secret:FACTORY_GITHUB_TOKEN', false],
      ['slack', false],
      ['connector:linear', true],
      ['secret:WEBHOOK', true],
    ]);
    expect(steps.find((s) => s.id === 'connector:vercel')).toMatchObject({ broken: true });
  });

  test('an API without `state`: an active connector is done', () => {
    const [step] = setupSteps({ connectors: [connector('legacy', { status: 'active' })], secrets: [], slack: { needed: false, installed: false }, slackName: 'Slack' });
    expect(step).toMatchObject({ id: 'connector:legacy', done: true });
  });

  test('Slack is a step when the setup asked for it or kortix.yaml declares the Slack channel', () => {
    expect(slackNeeded([], false)).toBe(false);
    expect(slackNeeded([], true)).toBe(true);
    expect(slackNeeded([connector('kortix_slack', { provider: 'channel', platform: 'slack' })], false)).toBe(true);
    expect(slackNeeded([connector('kortix_email', { provider: 'channel', platform: 'email' })], false)).toBe(false);
  });
});
