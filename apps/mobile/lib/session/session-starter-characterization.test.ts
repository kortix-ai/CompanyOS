/**
 * Characterization (KRTX-4772): the session-starter rules both hosts
 * hand-copy. Mobile `sessionStarter` and web `sessionStarter` classify the
 * same `initiator` into member/trigger/channel/api/system with the same
 * "You only when the starter is the viewer" rule. This pins the cases the
 * two implementations agree on today, so the extraction into
 * `@kortix/shared/session/session-starter` cannot silently change either
 * host. It runs before the extraction (these imports) and the same
 * expectations move to `packages/shared/src/session/session-starter.test.ts`
 * against the shared module.
 */
import { describe, expect, test } from 'bun:test';

import { sessionStarter as mobileSessionStarter } from './session-tree';
import { sessionStarter as webSessionStarter } from '../../../../packages/ui/src/workspace/projects/session-starter';
import type { ProjectSession } from '@/lib/projects/projects-client';

/** A session row reduced to the fields the classification reads. */
const row = (
  overrides: {
    initiator?: { type: 'member' | 'trigger' | 'channel' | 'api' | 'system'; id: string | null; label: string | null } | null;
    created_by?: string | null;
    is_owner?: boolean;
    owner_name?: string | null;
    owner_email?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
) => ({ initiator: null, created_by: null, owner_name: null, owner_email: null, metadata: {}, ...overrides });

const webLabels = { you: 'You', unknown: 'Unknown' };

const mobile = (r: ReturnType<typeof row>, viewerId: string | null | undefined) =>
  mobileSessionStarter(r as unknown as ProjectSession, viewerId);

describe('member starter', () => {
  test('the viewer reads "You" on both hosts', () => {
    const r = row({ initiator: { type: 'member', id: 'u1', label: 'Ada' } });
    expect(mobile(r, 'u1')).toEqual({ type: 'member', label: 'You', icon: null });
    expect(webSessionStarter(r, 'u1', webLabels)).toMatchObject({ type: 'member', isViewer: true, label: 'You' });
  });

  test('another member shows the name on both hosts', () => {
    const r = row({ initiator: { type: 'member', id: 'u2', label: 'Ada' } });
    expect(mobile(r, 'u1').label).toBe('Ada');
    expect(webSessionStarter(r, 'u1', webLabels)).toMatchObject({ isViewer: false, label: 'Ada' });
  });

  test('a run another member started on the viewer-created child is never "You"', () => {
    // Children keep created_by (is_owner true) but show the run's starter.
    const r = row({ initiator: { type: 'member', id: 'u2', label: 'Bo' }, created_by: 'u1', is_owner: true });
    expect(mobile(r, 'u1').label).toBe('Bo');
    expect(webSessionStarter(r, 'u1', webLabels)).toMatchObject({ isViewer: false, label: 'Bo' });
  });
});

describe('trigger starter', () => {
  test('a cron, a webhook and any other source classify as a trigger', () => {
    for (const source of ['trigger:cron', 'trigger:webhook', 'trigger:api']) {
      const r = row({ initiator: { type: 'trigger', id: 'nightly', label: 'nightly' }, metadata: { source } });
      expect(mobile(r, 'u1').type).toBe('trigger');
      expect(webSessionStarter(r, 'u1', webLabels)).toMatchObject({ type: 'trigger', id: 'nightly', label: 'nightly' });
    }
  });
});

describe('channel starter', () => {
  test('every channel id classifies as a channel and keeps its label', () => {
    for (const id of ['slack', 'teams', 'email', 'telegram', 'discord', 'xmpp']) {
      const r = row({ initiator: { type: 'channel', id, label: 'Slack' } });
      expect(mobile(r, 'u1').type).toBe('channel');
      const web = webSessionStarter(r, 'u1', webLabels);
      expect(web.type).toBe('channel');
      expect(web.id).toBe(id);
      expect(web.label).toBe('Slack');
    }
  });
});

describe('api and system starters', () => {
  test('an api key names the service account', () => {
    const r = row({ initiator: { type: 'api', id: 'sa1', label: 'CI key' } });
    expect(mobile(r, 'u1')).toMatchObject({ type: 'api', label: 'CI key' });
    expect(webSessionStarter(r, 'u1', webLabels)).toMatchObject({ type: 'api', id: 'sa1', label: 'CI key' });
  });

  test('a system run names the system', () => {
    const r = row({ initiator: { type: 'system', id: 'system:x', label: 'Kortix' } });
    expect(mobile(r, 'u1').label).toBe('Kortix');
    expect(webSessionStarter(r, 'u1', webLabels)).toMatchObject({ type: 'system', label: 'Kortix' });
  });
});

describe('null initiator', () => {
  test('reads as a member of the creator; the viewer sees "You" on both hosts', () => {
    const r = row({ created_by: 'u1' });
    expect(mobile(r, 'u1').label).toBe('You');
    expect(webSessionStarter(r, 'u1', webLabels)).toMatchObject({ type: 'member', isViewer: true, label: 'You' });
  });

  test('another viewer is never "You" (the server serves is_owner as a boolean)', () => {
    const r = row({ created_by: 'u1', is_owner: false });
    expect(mobile(r, 'u2').label).toBe('Member');
    expect(webSessionStarter(r, 'u2', webLabels)).toMatchObject({ isViewer: false, label: 'Unknown' });
  });
});
