/**
 * An App's OpenAPI document → the connector `app-<slug>`: one action per
 * operation (operationId required), the risk from the method or
 * `x-kortix-risk`, parameters and body merged into one input schema, and the
 * call path that builds the request from the arguments and hands it to the
 * App transport with no credential.
 */
import { describe, expect, test } from 'bun:test';
import { executeCall, paramHintsFromSchema, type AppCallRequest, type FetchImpl } from './call';
import { appConnectorSlug, appToolConnectorSpecs, appToolsCatalogHash } from './app-tools';
import { AppToolsDocumentError, normalizeAppTools } from './normalize';

const DOC = {
  openapi: '3.1.0',
  info: { title: 'Orders', version: '1' },
  paths: {
    '/orders/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'get_order',
        summary: 'Read one order by id',
        parameters: [{ name: 'expand', in: 'query', schema: { type: 'boolean' } }],
      },
      delete: { operationId: 'cancel_order', description: 'Cancel an order' },
      patch: { operationId: 'flag_order', 'x-kortix-risk': 'read' },
    },
    '/orders': {
      post: {
        operationId: 'create_order',
        summary: 'Create an order',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { customer: { type: 'string' } } } } },
        },
      },
    },
  },
};

describe('normalizeAppTools', () => {
  const actions = normalizeAppTools(DOC, 'orders');
  const byPath = Object.fromEntries(actions.map((action) => [action.path, action]));

  test('one action per operation, named by operationId, bound to the App', () => {
    expect(actions.map((action) => action.path).sort()).toEqual(['cancel_order', 'create_order', 'flag_order', 'get_order']);
    expect(byPath.get_order!.binding).toEqual({ kind: 'app', app: 'orders', method: 'GET', path: '/orders/{id}' });
    expect(byPath.create_order!.binding).toEqual({ kind: 'app', app: 'orders', method: 'POST', path: '/orders' });
    expect(byPath.get_order!.description).toBe('Read one order by id');
    expect(byPath.cancel_order!.description).toBe('Cancel an order');
  });

  test('risk: GET read, DELETE destructive, POST write, x-kortix-risk overrides', () => {
    expect(byPath.get_order!.risk).toBe('read');
    expect(byPath.cancel_order!.risk).toBe('destructive');
    expect(byPath.create_order!.risk).toBe('write');
    expect(byPath.flag_order!.risk).toBe('read');
  });

  test('path-level, operation and body parameters merge into one input schema', () => {
    const schema = byPath.get_order!.inputSchema as { properties: Record<string, { 'x-in'?: string }>; required?: string[] };
    expect(Object.keys(schema.properties).sort()).toEqual(['expand', 'id']);
    expect(schema.properties.id!['x-in']).toBe('path');
    expect(schema.properties.expand!['x-in']).toBe('query');
    expect(schema.required).toEqual(['id']);
    const body = byPath.create_order!.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    expect(body.properties.body).toEqual({ type: 'object', properties: { customer: { type: 'string' } } });
    expect(body.required).toEqual(['body']);
  });

  test('an operation without operationId is refused, naming the operation', () => {
    const doc = { openapi: '3.0.3', paths: { '/ping': { get: { summary: 'Ping' } } } };
    expect(() => normalizeAppTools(doc, 'orders')).toThrow(new AppToolsDocumentError('operation GET /ping has no operationId: every App tool needs one'));
  });

  test('a bad x-kortix-risk, a duplicate operationId, OpenAPI 2 and an empty document are refused', () => {
    const op = (extra: Record<string, unknown>) => ({ openapi: '3.0.0', paths: { '/a': { post: { operationId: 'a', ...extra } } } });
    expect(() => normalizeAppTools(op({ 'x-kortix-risk': 'safe' }), 'x')).toThrow('x-kortix-risk must be read, write or destructive');
    expect(() => normalizeAppTools({ openapi: '3.0.0', paths: { '/a': { get: { operationId: 'same' } }, '/b': { get: { operationId: 'same' } } } }, 'x')).toThrow(
      'operations GET /a and GET /b have the same operationId "same"',
    );
    expect(() => normalizeAppTools({ swagger: '2.0', paths: {} }, 'x')).toThrow('must be OpenAPI 3');
    expect(() => normalizeAppTools({ openapi: '3.0.0', paths: {} }, 'x')).toThrow('has no `paths`');
  });
});

describe('appToolConnectorSpecs', () => {
  test('an App with tools is the connector app-<slug>, its document inside the App folder', () => {
    const { specs, errors } = appToolConnectorSpecs(
      { orders: { path: 'apps/orders', tools: 'openapi.json' }, site: { path: 'apps/site' }, crm: { tools: './api/tools.yaml' } },
      'kortix.yaml',
      new Set(),
    );
    expect(errors).toEqual([]);
    expect(specs.map((spec) => [spec.slug, spec.provider, spec.app, spec.spec, spec.auth.type])).toEqual([
      ['app-orders', 'app', 'orders', 'apps/orders/openapi.json', 'none'],
      ['app-crm', 'app', 'crm', 'apps/crm/api/tools.yaml', 'none'],
    ]);
    expect(appConnectorSlug('orders')).toBe('app-orders');
  });

  test('a declared connector under the same slug wins; a path outside the folder is an error', () => {
    const { specs, errors } = appToolConnectorSpecs(
      { orders: { tools: 'openapi.json' }, evil: { tools: '../../secrets.json' } },
      'kortix.yaml',
      new Set(['app-orders']),
    );
    expect(specs).toEqual([]);
    expect(errors.map((error) => error.slug)).toEqual(['app-orders', 'app-evil']);
  });

  test('the stored hash changes with the document text', () => {
    expect(appToolsCatalogHash('h', '{"a":1}')).not.toBe(appToolsCatalogHash('h', '{"a":2}'));
    expect(appToolsCatalogHash('h', '{"a":1}')).toBe(appToolsCatalogHash('h', '{"a":1}'));
  });
});

describe('executeCall with an app binding', () => {
  const neverFetch: FetchImpl = async () => {
    throw new Error('an App tool call must not go out by URL');
  };
  const actions = normalizeAppTools(DOC, 'orders');
  const action = (path: string) => actions.find((candidate) => candidate.path === path)!;

  test('path and query are filled from the arguments; no credential and no connector header reach the App', async () => {
    const seen: AppCallRequest[] = [];
    const result = await executeCall({
      binding: action('get_order').binding,
      auth: { type: 'bearer', in: 'header', name: null, prefix: null },
      secret: 'stored-credential',
      headers: { 'X-Static': 'connector-header' },
      args: { id: 'o 1', expand: true },
      paramHints: paramHintsFromSchema(action('get_order').inputSchema),
      callApp: async (request) => {
        seen.push(request);
        return { status: 200, ok: true, text: '{"id":"o 1","total":12}' };
      },
      fetchImpl: neverFetch,
    });
    expect(result).toEqual({ status: 200, ok: true, data: { id: 'o 1', total: 12 } });
    expect(seen).toEqual([{ app: 'orders', method: 'GET', path: '/orders/o%201?expand=true', headers: {} }]);
    expect(JSON.stringify(seen)).not.toContain('stored-credential');
  });

  test('the JSON body goes as the request body; an error status comes back with its body', async () => {
    const seen: AppCallRequest[] = [];
    const result = await executeCall({
      binding: action('create_order').binding,
      args: { body: { customer: 'c-9' } },
      paramHints: paramHintsFromSchema(action('create_order').inputSchema),
      callApp: async (request) => {
        seen.push(request);
        return { status: 422, ok: false, text: '{"error":"customer unknown"}' };
      },
      fetchImpl: neverFetch,
    });
    expect(result).toEqual({ status: 422, ok: false, data: { error: 'customer unknown' } });
    expect(seen[0]).toEqual({ app: 'orders', method: 'POST', path: '/orders', headers: { 'Content-Type': 'application/json' }, body: '{"customer":"c-9"}' });
  });

  test('without an App transport the call throws instead of fetching', async () => {
    await expect(executeCall({ binding: action('get_order').binding, args: { id: 'x' }, fetchImpl: neverFetch })).rejects.toThrow(
      'app connector calls are not wired here',
    );
  });
});
