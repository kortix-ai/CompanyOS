import { describe, expect, test } from 'bun:test';

import { classifySessionStarter } from './session-starter';

/**
 * Characterization of the shared session-starter classification (KRTX-4772).
 * The same expectations first ran against mobile `sessionStarter` and web
 * `sessionStarter` before the extraction
 * (`apps/mobile/lib/session/session-starter-characterization.test.ts`); the
 * host suites still pin each host's wording and icons.
 */
const row = (overrides: Record<string, unknown> = {}) => ({
  initiator: null,
  created_by: null,
  is_owner: undefined,
  owner_name: null,
  owner_email: null,
  ...overrides,
});

describe('member starter', () => {
  test('the viewer', () => {
    expect(classifySessionStarter(row({ initiator: { type: 'member', id: 'u1', label: 'Ada' } }), 'u1')).toEqual({
      type: 'member',
      id: 'u1',
      isViewer: true,
      label: 'Ada',
    });
  });

  test('another member', () => {
    expect(classifySessionStarter(row({ initiator: { type: 'member', id: 'u2', label: 'Ada' } }), 'u1')).toEqual({
      type: 'member',
      id: 'u2',
      isViewer: false,
      label: 'Ada',
    });
  });

  test('a run another member started on the viewer-created child is never the viewer', () => {
    expect(
      classifySessionStarter(
        row({ initiator: { type: 'member', id: 'u2', label: 'Bo' }, created_by: 'u1', is_owner: true }),
        'u1',
      ),
    ).toEqual({ type: 'member', id: 'u2', isViewer: false, label: 'Bo' });
  });

  test('an unnamed member', () => {
    expect(classifySessionStarter(row({ initiator: { type: 'member', id: 'u3', label: null } }), 'u1')).toEqual({
      type: 'member',
      id: 'u3',
      isViewer: false,
      label: null,
    });
  });
});

describe('trigger starter', () => {
  test('a cron, a webhook and any other source classify as a trigger', () => {
    for (const source of ['trigger:cron', 'trigger:webhook', 'trigger:api']) {
      expect(
        classifySessionStarter(
          row({ initiator: { type: 'trigger', id: 'nightly', label: 'nightly' } }),
          'u1',
        ),
      ).toEqual({ type: 'trigger', id: 'nightly', isViewer: false, label: 'nightly' });
    }
  });
});

describe('channel starter', () => {
  test('every channel id keeps its type, id and label', () => {
    for (const id of ['slack', 'teams', 'email', 'telegram', 'discord', 'xmpp']) {
      expect(classifySessionStarter(row({ initiator: { type: 'channel', id, label: 'Slack' } }), 'u1')).toEqual({
        type: 'channel',
        id,
        isViewer: false,
        label: 'Slack',
      });
    }
  });
});

describe('api and system starters', () => {
  test('an api key', () => {
    expect(classifySessionStarter(row({ initiator: { type: 'api', id: 'sa1', label: 'CI key' } }), 'u1')).toEqual({
      type: 'api',
      id: 'sa1',
      isViewer: false,
      label: 'CI key',
    });
  });

  test('a system run', () => {
    expect(classifySessionStarter(row({ initiator: { type: 'system', id: 'system:x', label: 'Kortix' } }), 'u1')).toEqual({
      type: 'system',
      id: 'system:x',
      isViewer: false,
      label: 'Kortix',
    });
  });
});

describe('null initiator — the backfill fallback reads as a member of the creator', () => {
  test('the creator is the viewer (the row carries no is_owner): the id comparison decides', () => {
    expect(classifySessionStarter(row({ created_by: 'u1' }), 'u1')).toEqual({
      type: 'member',
      id: 'u1',
      isViewer: true,
      label: null,
    });
  });

  test('another viewer is never the viewer', () => {
    expect(classifySessionStarter(row({ created_by: 'u1', is_owner: false }), 'u2')).toEqual({
      type: 'member',
      id: 'u1',
      isViewer: false,
      label: null,
    });
  });

  test('a row that names no viewer is never the viewer', () => {
    expect(classifySessionStarter(row({ created_by: 'u1' }), null).isViewer).toBe(false);
    expect(classifySessionStarter(row({ created_by: 'u1' }), undefined).isViewer).toBe(false);
  });
});
