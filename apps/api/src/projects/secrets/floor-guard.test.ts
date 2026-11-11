import { describe, expect, test } from 'bun:test';

import type { SecretStrategy } from '../../secrets/strategy';
import { materializeSecretDelivery, type ResolvedProjectSecret } from '../secrets';
import { type FloorGuardRow, floorWithholdsBody, secretsWithheldByFloor } from './floor-guard';

const HOSTED = { rules: [{ host: 'api.service.test' }], on_no_match: 'deny' as const, tls: 'terminate' as const };
const BROKERED = { backend: 'kortix_fetch' as const, rules: [{ host: 'api.service.test' }] };

const ROWS: FloorGuardRow[] = [
  { identifier: 'PLAIN', name: 'PLAIN_TOKEN', strategy: 'runtime', consumer: 'sandbox', egressPolicy: null },
  { identifier: 'LEGACY', name: 'LEGACY_TOKEN', strategy: null, consumer: null, egressPolicy: null },
  { identifier: 'HOSTED', name: 'HOSTED_KEY', strategy: 'egress', consumer: 'network', egressPolicy: HOSTED },
  { identifier: 'BROKERED', name: 'BROKERED_KEY', strategy: 'broker', consumer: 'http_broker', egressPolicy: BROKERED },
  { identifier: 'DENIED', name: 'DENIED_KEY', strategy: 'denied', consumer: 'sandbox', egressPolicy: null },
  { identifier: 'RESERVED', name: 'KORTIX_INTERNAL', strategy: 'runtime', consumer: 'sandbox', egressPolicy: null },
];

describe('secretsWithheldByFloor', () => {
  test('an egress floor names every plain secret with no host list, sorted', () => {
    expect(secretsWithheldByFloor(ROWS, 'egress')).toEqual(['LEGACY', 'PLAIN']);
  });

  test('a broker floor also names the network-delivered secret', () => {
    expect(secretsWithheldByFloor(ROWS, 'broker')).toEqual(['HOSTED', 'LEGACY', 'PLAIN']);
  });

  test('runtime and denied floors are never refused', () => {
    expect(secretsWithheldByFloor(ROWS, 'runtime')).toEqual([]);
    expect(secretsWithheldByFloor(ROWS, 'denied')).toEqual([]);
  });

  test('a project whose secrets all have a host list passes an egress floor', () => {
    expect(secretsWithheldByFloor(ROWS.filter((r) => r.identifier !== 'PLAIN' && r.identifier !== 'LEGACY'), 'egress')).toEqual([]);
  });

  // The guard restates `materializeSecretDelivery`'s drop rule. Run both over
  // the same rows so the two cannot drift apart.
  test.each(['egress', 'broker'] as SecretStrategy[])('names exactly the rows materializeSecretDelivery drops at a %s floor', async (floor) => {
    const resolved: ResolvedProjectSecret[] = ROWS.filter((r) => !r.name.startsWith('KORTIX_')).map((r) => ({
      secretId: `secret-${r.identifier}`,
      identifier: r.identifier,
      key: r.name,
      value: `value-of-${r.identifier}`,
      strategy: r.strategy ?? undefined,
      consumer: r.consumer ?? undefined,
      egressPolicy: r.egressPolicy,
      projectDefaultStrategy: floor,
    }));
    const deliveredBefore = new Set(
      (
        await materializeSecretDelivery(
          resolved.map((r) => ({ ...r, projectDefaultStrategy: null })),
          Object.fromEntries(resolved.map((r) => [r.key, r.value])),
          { sessionId: 'session-1', grantEnv: resolved.map((r) => r.identifier), mintHandleFor: async () => 'handle' },
        )
      ).map((r) => r.identifier),
    );
    const deliveredAfter = new Set(
      (
        await materializeSecretDelivery(resolved, Object.fromEntries(resolved.map((r) => [r.key, r.value])), {
          sessionId: 'session-1',
          grantEnv: resolved.map((r) => r.identifier),
          mintHandleFor: async () => 'handle',
        })
      ).map((r) => r.identifier),
    );
    const dropped = [...deliveredBefore].filter((id) => !deliveredAfter.has(id)).sort();
    expect(secretsWithheldByFloor(ROWS, floor)).toEqual(dropped);
  });
});

describe('floorWithholdsBody', () => {
  test('names the identifiers, the count and the fix', () => {
    const body = floorWithholdsBody('egress', ['LEGACY', 'PLAIN']);
    expect(body).toMatchObject({ code: 'secret_floor_withholds', floor: 'egress', withheld: ['LEGACY', 'PLAIN'] });
    expect(body.error).toBe(
      'A default of egress withholds 2 secrets from every session: LEGACY, PLAIN. ' +
        'Give each secret a host so it is delivered at the network, or keep the default at runtime.',
    );
  });

  test('a broker floor names the broker fix', () => {
    expect(floorWithholdsBody('broker', ['ONE']).error).toBe(
      'A default of broker withholds 1 secret from every session: ONE. Move each secret to broker delivery, or keep the default at runtime.',
    );
  });
});
