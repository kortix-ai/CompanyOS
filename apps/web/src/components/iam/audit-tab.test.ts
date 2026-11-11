import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

import type { ListAuditFilter } from '@/lib/iam-client';
import { auditFilterWire, RESOURCE_TYPES } from './audit-tab';

type FilterState = Parameters<typeof auditFilterWire>[0];

const EMPTY: FilterState = {
  action: '',
  actor: '',
  actorType: '',
  projectId: '',
  sessionId: '',
  credentialKind: '',
  phase: '',
  outcome: '',
  resourceType: '',
  q: '',
  since: '',
  until: '',
};

const FULL: FilterState = {
  action: 'iam.policy',
  actor: 'user-1',
  actorType: 'human',
  projectId: 'p1',
  sessionId: 's1',
  credentialKind: 'oauth_app',
  phase: 'completed',
  outcome: 'success',
  resourceType: 'project_session',
  q: 'needle',
  since: '2026-01-01T00:00:00Z',
  until: '2026-01-02T00:00:00Z',
};

// The one filter→wire projection behind both audit calls: the list query and
// the paginated export used to carry two hand-kept copies of these twelve
// mappings (see the issue's `filter_mapping_copies` finding).
describe('auditFilterWire', () => {
  test('an empty filter sends no fields', () => {
    expect(auditFilterWire(EMPTY)).toEqual({});
  });

  test('all twelve populated fields map to their wire keys', () => {
    expect(auditFilterWire(FULL)).toEqual({
      action: 'iam.policy',
      actor: 'user-1',
      actor_type: 'human',
      project_id: 'p1',
      session_id: 's1',
      credential_kind: 'oauth_app',
      phase: 'completed',
      outcome: 'success',
      resource_type: 'project_session',
      q: 'needle',
      since: '2026-01-01T00:00:00Z',
      until: '2026-01-02T00:00:00Z',
    });
  });

  test('blank fields drop out while set ones survive on a mixed filter', () => {
    expect(auditFilterWire({ ...EMPTY, action: 'connector.', outcome: 'failure' })).toEqual({
      action: 'connector.',
      outcome: 'failure',
    });
  });

  test('the list and export compositions type as the SDK wire types, no cast', () => {
    // What the two call sites in audit-tab.tsx build: the list query adds
    // cursor + limit 50, the paginated export adds format + its own cursor.
    const list: ListAuditFilter = { ...auditFilterWire(FULL), cursor: 'c1', limit: 50 };
    const download: ListAuditFilter & { format: 'csv' | 'jsonl' } = {
      format: 'jsonl',
      ...auditFilterWire(FULL),
      cursor: 'c2',
    };
    expect(list.cursor).toBe('c1');
    expect(list.limit).toBe(50);
    expect(download.format).toBe('jsonl');
    expect(download.cursor).toBe('c2');
  });
});

// KRTX-2399: the quick-filter labels are translated, so the tabs must not use
// them as their value. A label-keyed tab matched no preset outside English.
describe('audit quick filters', () => {
  const source = readFileSync(new URL('./audit-tab.tsx', import.meta.url), 'utf8');

  test('each tab is keyed by its stable id, not its translated label', () => {
    expect(source).toContain('value={preset.id}');
    expect(source).toContain('QUICK_FILTERS.find((item) => item.id === value)');
    expect(source).not.toContain('value={preset.label}');
    expect(source).not.toContain('item.label === value');
  });
});

describe('resource filter', () => {
  // The "Connector action" option sent `connector_action`, a resource type no
  // trigger writes, so the filter always answered an empty log. The connector
  // call trigger writes `connector_call` (packages/db/migrations, the latest
  // `audit_connector_call` definition).
  test('"Connector action" filters on the resource type the connector call trigger writes', () => {
    const option = RESOURCE_TYPES.find((item) => item.label === 'Connector action');
    expect(option?.value).toBe('connector_call');
    expect(auditFilterWire({ ...EMPTY, resourceType: option!.value }).resource_type).toBe('connector_call');

    const migrations = new URL('../../../../../packages/db/migrations/', import.meta.url);
    const latest = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .filter((name) => readFileSync(new URL(name, migrations), 'utf8').includes('FUNCTION kortix.audit_connector_call'))
      .at(-1);
    expect(latest).toBeDefined();
    expect(readFileSync(new URL(latest!, migrations), 'utf8')).toContain(`'${option!.value}'`);
  });
});
