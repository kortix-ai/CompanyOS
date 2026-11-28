import { describe, expect, test } from 'bun:test';
import { signCaller, verifyCaller } from '../../shared/in-process-caller';
import type { CatalogOperation } from '../../shared/operation-registry';
import { operationInputSchema, operationRequest } from './kortix';

const secretsSet: CatalogOperation = {
  operation: { id: 'secrets.set', action: 'project.secret.write', exposure: 'agent', method: 'POST', summary: 'Set a secret', tags: [] },
  method: 'POST',
  path: '/v1/workspaces/:workspaceId/secrets',
  parameters: [
    { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string' } },
    { name: 'dry_run', in: 'query', required: false, schema: { type: 'boolean' } },
  ],
  body: { type: 'object', properties: { name: { type: 'string' } } },
  bodyRequired: true,
};

describe('the kortix connector tool input', () => {
  test('path and query parameters are properties; the JSON body is `body`', () => {
    expect(operationInputSchema(secretsSet)).toEqual({
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        dry_run: { type: 'boolean' },
        body: { type: 'object', properties: { name: { type: 'string' } }, description: 'The JSON request body.' },
      },
      required: ['workspaceId', 'body'],
      additionalProperties: false,
    });
  });

  test('a call becomes the route request: path filled and encoded, query set, body as JSON', async () => {
    const r = operationRequest(secretsSet, { workspaceId: 'w 1', dry_run: true, body: { name: 'K' } });
    expect(r.method).toBe('POST');
    expect(new URL(r.url).pathname).toBe('/v1/workspaces/w%201/secrets');
    expect(new URL(r.url).searchParams.get('dry_run')).toBe('true');
    expect(r.headers.get('content-type')).toBe('application/json');
    expect(await r.json()).toEqual({ name: 'K' });
  });

  test('a missing required input or an unknown argument is a tool error naming it', () => {
    expect(() => operationRequest(secretsSet, { body: {} })).toThrow('secrets.set needs "workspaceId".');
    expect(() => operationRequest(secretsSet, { workspaceId: 'w' })).toThrow('secrets.set needs "body".');
    expect(() => operationRequest(secretsSet, { workspaceId: 'w', body: {}, name: 'K' })).toThrow('takes no "name"');
  });
});

describe('the signed caller header', () => {
  const caller = { tokenId: '0b6f7a9e-1111-4222-8333-944455556666', sessionId: 'b1c2d3e4-1111-4222-8333-944455556666' };

  test('round-trips; no session reads back as null', () => {
    expect(verifyCaller(signCaller(caller, 1_000), 2_000)).toEqual(caller);
    expect(verifyCaller(signCaller({ tokenId: caller.tokenId, sessionId: null }, 1_000), 2_000)).toEqual({ tokenId: caller.tokenId, sessionId: null });
  });

  test('a changed token, a forged signature, two joined headers or an expired one is refused', () => {
    const signed = signCaller(caller, 1_000);
    const [, session, expiry, mac] = signed.split('.');
    expect(verifyCaller(`ffffffff-1111-4222-8333-944455556666.${session}.${expiry}.${mac}`, 2_000)).toBeNull();
    expect(verifyCaller(`${signed.slice(0, -2)}xx`, 2_000)).toBeNull();
    expect(verifyCaller(`${signed}, ${signed}`, 2_000)).toBeNull();
    expect(verifyCaller(signed, 1_000 + 6 * 60_000)).toBeNull();
    expect(verifyCaller('', 2_000)).toBeNull();
  });
});
