/**
 * Placements on stored egress rules, the no-match explanation, the refusal
 * reason mapping, refuse pairs in the stream substituter, and echo re-sealing.
 * Pure: no database, no transport.
 */
import { describe, expect, test } from 'bun:test';
import { RELAY_REFUSAL_REASONS } from '@kortix/api-contract/secret-relay';
import { refusalReasonFor } from './broker/errors';
import { prepareSecretBrokerRequest } from './broker/request-gate';
import { resealSecretInResponse } from './broker/substitution';
import { presentedHandleRefusalReason } from './handle-substitution';
import { StreamSubstituter } from './stream-substitute';
import { explainNoMatch, parseEgressPolicy, placementAllows } from './strategy';

const HANDLE = 'kortix_brokered__use_kortix_fetch__KXS1aaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';

describe('parseEgressPolicy — placements', () => {
  test('a rule without placements parses unchanged (existing rows)', () => {
    expect(parseEgressPolicy({ rules: [{ host: 'api.example.com' }] })).toEqual({
      ok: true,
      policy: { rules: [{ host: 'api.example.com' }] },
    });
  });

  test('placements are deduplicated into canonical order, header lowercased', () => {
    expect(
      parseEgressPolicy({
        rules: [{ host: 'api.example.com', placements: ['body', 'header', 'body'], header: 'Authorization' }],
      }),
    ).toEqual({
      ok: true,
      policy: { rules: [{ host: 'api.example.com', placements: ['header', 'body'], header: 'authorization' }] },
    });
  });

  test.each([
    [{ placements: [] }, 'rule.placements must be a non-empty array'],
    [{ placements: ['cookie'] }, 'invalid placement: cookie'],
    [{ placements: 'header' }, 'rule.placements must be a non-empty array'],
    [{ header: 'authorization' }, 'rule.header requires placements to include header'],
    [{ placements: ['query'], header: 'authorization' }, 'rule.header requires placements to include header'],
    [{ placements: ['header'], header: 'bad header' }, 'rule.header must be a header name'],
  ])('refuses %j', (extra, error) => {
    expect(parseEgressPolicy({ rules: [{ host: 'api.example.com', ...extra }] })).toEqual({ ok: false, error });
  });
});

describe('placementAllows', () => {
  test('absent placements allow every surface and every header', () => {
    for (const surface of ['header', 'query', 'path', 'body'] as const) {
      expect(placementAllows({}, surface, 'x-any')).toBe(true);
    }
  });

  test('listed placements only; an exact header name narrows headers', () => {
    const rule = { placements: ['header' as const], header: 'authorization' };
    expect(placementAllows(rule, 'header', 'authorization')).toBe(true);
    expect(placementAllows(rule, 'header', 'x-api-key')).toBe(false);
    expect(placementAllows(rule, 'query')).toBe(false);
  });
});

describe('explainNoMatch', () => {
  const policy = { rules: [{ host: 'api.example.com', methods: ['GET'], path: '/v1/*' }] };
  test('host, then method, then path', () => {
    expect(explainNoMatch(policy, { host: 'other.example.com', method: 'GET', path: '/v1/a' })).toBe('credential_host');
    expect(explainNoMatch(policy, { host: 'api.example.com', method: 'POST', path: '/v1/a' })).toBe('credential_method');
    expect(explainNoMatch(policy, { host: 'api.example.com', method: 'GET', path: '/v2/a' })).toBe('policy_denied');
  });
});

describe('refusalReasonFor', () => {
  test('maps every refusal code into the closed set and failures to null', () => {
    expect(refusalReasonFor('unsafe_destination', 403)).toBe('private_address');
    expect(refusalReasonFor('unsafe_destination', 400)).toBe('credential_transport');
    expect(refusalReasonFor('unsafe_destination', 502)).toBeNull();
    expect(refusalReasonFor('upstream_encoding_unsupported', 502)).toBe('credential_transport');
    expect(refusalReasonFor('session_not_active', 403)).toBe('credential_expired');
    expect(refusalReasonFor('session_secret_handle_required', 409)).toBe('credential_expired');
    expect(refusalReasonFor('policy_denied', 403)).toBe('policy_denied');
    expect(refusalReasonFor('secret_not_found', 404)).toBe('policy_denied');
    expect(refusalReasonFor('upstream_failed', 502)).toBeNull();
    expect(refusalReasonFor('upstream_timeout', 504)).toBeNull();
    expect(refusalReasonFor('relay_disabled', 503)).toBeNull();
  });

  test('an explicit reason wins', () => {
    expect(refusalReasonFor('policy_denied', 403, 'credential_placement')).toBe('credential_placement');
  });

  test('the closed set is exactly the eight reasons', () => {
    expect([...RELAY_REFUSAL_REASONS].sort() as string[]).toEqual(
      [
        'credential_expired',
        'credential_forged',
        'credential_host',
        'credential_method',
        'credential_placement',
        'credential_transport',
        'policy_denied',
        'private_address',
      ].sort(),
    );
  });
});

describe('presentedHandleRefusalReason', () => {
  test('forged or stolen wins over host_denied', () => {
    expect(presentedHandleRefusalReason([])).toBeNull();
    expect(presentedHandleRefusalReason([{ reason: 'host_denied', identifier: 'A', lookup_id: 'x' }])).toBe(
      'credential_host',
    );
    expect(
      presentedHandleRefusalReason([
        { reason: 'host_denied', identifier: 'A', lookup_id: 'x' },
        { reason: 'stolen', identifier: null, lookup_id: 'y' },
      ]),
    ).toBe('credential_forged');
  });
});

describe('the buffered broker enforces placements', () => {
  const policy = { backend: 'kortix_fetch' as const, rules: [{ host: 'api.example.com' }] };
  const placed = (extra: Record<string, unknown>) => [
    {
      identifier: 'A',
      handle: HANDLE,
      value: 'real-value',
      policy: { rules: [{ host: 'api.example.com', ...extra }] },
    },
  ];

  test('a body handle under a header-only rule is refused with credential_placement', () => {
    expect(() =>
      prepareSecretBrokerRequest(
        policy,
        'route-secret',
        {
          url: 'https://api.example.com/x',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body_base64: Buffer.from(JSON.stringify({ k: HANDLE })).toString('base64'),
        },
        placed({ placements: ['header'] }),
      ),
    ).toThrow(expect.objectContaining({ code: 'policy_denied', status: 403, refused: 'credential_placement' }));
  });

  test('a path handle under a rule that allows the path is substituted', () => {
    const prepared = prepareSecretBrokerRequest(
      policy,
      'route-secret',
      { url: `https://api.example.com/bot${HANDLE}/send`, method: 'GET' },
      placed({ placements: ['path'] }),
    );
    expect(prepared.url.pathname).toBe('/botreal-value/send');
    expect(prepared.substituted).toEqual(['A']);
  });
});

describe('StreamSubstituter refuse pairs', () => {
  test('a refused needle stops the stream at the match and records its label', () => {
    const sub = new StreamSubstituter([
      { needle: Buffer.from(HANDLE), replacement: Buffer.alloc(0), label: 'A', refuse: true },
    ]);
    const out = Buffer.concat([
      sub.push(Buffer.from(`{"k":"${HANDLE.slice(0, 10)}`)),
      sub.push(Buffer.from(`${HANDLE.slice(10)}","after":"x"}`)),
      sub.flush(),
    ]).toString('utf8');
    expect(out).toBe('{"k":"');
    expect(sub.refusedLabel).toBe('A');
  });
});

describe('resealSecretInResponse', () => {
  test('each representation of the value becomes the same representation of the handle', () => {
    const value = 'sk/live+value=';
    const body = Buffer.from(
      `${value}|${encodeURIComponent(value)}|${Buffer.from(value).toString('base64')}`,
    );
    expect(resealSecretInResponse(body, { value, handle: HANDLE }).toString('utf8')).toBe(
      `${HANDLE}|${encodeURIComponent(HANDLE)}|${Buffer.from(HANDLE).toString('base64')}`,
    );
  });

  test('no known handle still redacts', () => {
    expect(resealSecretInResponse(Buffer.from('a-secret'), { value: 'a-secret', handle: null }).toString()).toBe(
      '[REDACTED]',
    );
  });
});
