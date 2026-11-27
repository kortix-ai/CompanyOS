#!/usr/bin/env bun
/**
 * The Kortix operation catalog: every concrete API route, joined with its
 * OpenAPI operation, its stable id and what it declares about access.
 *
 * Every client of Kortix (the `kortix` connector, MCP, the CLI, the SDK, agent
 * tools) is generated from this catalog, so a route that is not classified
 * here is a route none of them can reach correctly. Design:
 * `.agents/skills/learnings/work/kortix-surface/README.md`.
 *
 * A route is classified when its operation declares all three:
 *   - `operationId`: stable, dotted (`sessions.create`);
 *   - `x-kortix-action`: the IAM action it needs (`project.session.create`),
 *     or `none` when it checks no IAM action (public, webhook, self-only);
 *   - `x-kortix-exposure`: who may reach it through the catalog:
 *       `agent`    agents and people, through every client;
 *       `human`    people only (sign-in, billing checkout, key display);
 *       `internal` no client: webhooks, sandbox callbacks, admin, ops;
 *       `local`    a machine-local CLI concern served by the API.
 *
 *   bun scripts/operation-catalog.ts            write the catalog and print coverage
 *   bun scripts/operation-catalog.ts --check    fail on an unclassified route not in the baseline,
 *                                               or a baseline entry that is now classified
 *
 * Run with the same placeholder env as dump-routes.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workspaceAliasOf } from '@kortix/shared/workspace-routes';
import { app } from '../src/index';

export const EXPOSURES = ['agent', 'human', 'internal', 'local'] as const;
export type Exposure = (typeof EXPOSURES)[number];

export interface CatalogEntry {
  method: string;
  path: string;
  typed: boolean;
  operation_id: string | null;
  action: string | null;
  exposure: Exposure | null;
  summary: string | null;
  tags: string[];
}

const ROOT = resolve(import.meta.dir, '../../..');
const OUT = resolve(ROOT, 'tests/spec/operations.generated.json');
const BASELINE = resolve(import.meta.dir, 'operation-catalog.baseline.json');
/** Routes that are not operations (a raw passthrough, a protocol endpoint), each with the reason. */
const EXCLUSIONS = resolve(import.meta.dir, 'operation-catalog.exclusions.json');
const excluded: Record<string, string> = JSON.parse(readFileSync(EXCLUSIONS, 'utf8')) as Record<string, string>;

// A parameter starts a segment; a colon inside one is a literal custom verb (`/policies:bulk-delete`).
const toOpenApiPath = (path: string) => path.replace(/(?<=\/):([A-Za-z0-9_]+)(\{[^}]*\})?/g, '{$1}');
const key = (method: string, path: string) => `${method} ${path}`;

function concreteRoutes(): Array<{ method: string; path: string }> {
  // `use()` middleware is listed as `ALL` with a `(c, next)` handler; an `.all()` passthrough takes `(c)`.
  const routes = (app.routes as Array<{ method: string; path: string; handler: (...args: unknown[]) => unknown }>)
    .map((r) => ({ method: r.method.toUpperCase(), path: r.path, handler: r.handler }))
    .filter((r) => !(r.method === 'ALL' && r.handler.length >= 2));
  const all = new Set(routes.map((r) => key(r.method, r.path)));
  const seen = new Set<string>();
  const out: Array<{ method: string; path: string }> = [];
  for (const r of routes) {
    // A legacy name of a canonical route is the same operation (one alias rule, as in dump-routes.ts).
    if (workspaceAliasOf(r.method, r.path, (m, p) => all.has(key(m, p)))) continue;
    const k = key(r.method, r.path);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ method: r.method, path: r.path });
  }
  return out;
}

export function buildCatalog(): CatalogEntry[] {
  const doc = (app as unknown as { getOpenAPI31Document(o: unknown): { paths?: Record<string, Record<string, Record<string, unknown>>> } }).getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'Kortix operation catalog', version: 'catalog' },
  });
  const paths = doc.paths ?? {};
  return concreteRoutes()
    .filter((r) => r.method !== 'OPTIONS')
    .map((r) => {
      const op = paths[toOpenApiPath(r.path)]?.[r.method.toLowerCase()];
      const exposure = op?.['x-kortix-exposure'];
      return {
        method: r.method,
        path: r.path,
        typed: Boolean(op),
        operation_id: (op?.operationId as string | undefined) ?? null,
        action: (op?.['x-kortix-action'] as string | undefined) ?? null,
        exposure: (EXPOSURES as readonly string[]).includes(exposure as string) ? (exposure as Exposure) : null,
        summary: (op?.summary as string | undefined) ?? null,
        tags: (op?.tags as string[] | undefined) ?? [],
      };
    })
    .sort((a, b) => key(a.method, a.path).localeCompare(key(b.method, b.path)));
}

export const classified = (e: CatalogEntry) => Boolean(e.operation_id && e.action && e.exposure) || key(e.method, e.path) in excluded;

/** The domain a route belongs to, for the coverage table: the first path segment after the workspace. */
export function domainOf(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const i = parts.findIndex((p) => p.startsWith(':'));
  const rest = parts[0] === 'v1' && (parts[1] === 'workspaces' || parts[1] === 'projects') && i === 2 ? parts.slice(3) : parts.slice(1);
  return rest[0] ?? '(root)';
}

{
  const catalog = buildCatalog();
  const unclassified = catalog.filter((e) => !classified(e)).map((e) => key(e.method, e.path));
  if (process.argv.includes('--check')) {
    const baseline = new Set<string>(JSON.parse(readFileSync(BASELINE, 'utf8')) as string[]);
    const fresh = unclassified.filter((k) => !baseline.has(k));
    const stale = [...baseline].filter((k) => !unclassified.includes(k));
    const ids = new Map<string, string>();
    const duplicate = catalog.filter((e) => e.operation_id && ids.has(e.operation_id) ? true : (e.operation_id && ids.set(e.operation_id, key(e.method, e.path)), false));
    const gone = Object.keys(excluded).filter((k) => !catalog.some((e) => key(e.method, e.path) === k));
    if (duplicate.length) console.error(`duplicate operationId: ${duplicate.map((e) => `${e.operation_id} (${key(e.method, e.path)})`).join(', ')}`);
    if (gone.length) console.error(`exclusions name routes that no longer exist: ${gone.join(', ')}`);
    if (fresh.length || stale.length || duplicate.length || gone.length) {
      if (fresh.length) console.error(`${fresh.length} route(s) are not classified (operationId, x-kortix-action, x-kortix-exposure):\n  ${fresh.join('\n  ')}`);
      if (stale.length) console.error(`${stale.length} baseline entr(y/ies) are classified now; remove them from ${BASELINE}:\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`operation catalog: ${catalog.length - unclassified.length}/${catalog.length} classified; ${unclassified.length} on the shrinking baseline`);
    process.exit(0);
  }
  writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`);
  if (process.argv.includes('--write-baseline')) writeFileSync(BASELINE, `${JSON.stringify(unclassified, null, 2)}\n`);
  const byDomain = new Map<string, { total: number; typed: number; ids: number; classified: number }>();
  for (const e of catalog) {
    const d = domainOf(e.path);
    const row = byDomain.get(d) ?? { total: 0, typed: 0, ids: 0, classified: 0 };
    row.total++;
    if (e.typed) row.typed++;
    if (e.operation_id) row.ids++;
    if (classified(e)) row.classified++;
    byDomain.set(d, row);
  }
  const rows = [...byDomain.entries()].sort((a, b) => b[1].total - a[1].total);
  console.log(`routes ${catalog.length} · typed ${catalog.filter((e) => e.typed).length} · with operationId ${catalog.filter((e) => e.operation_id).length} · classified ${catalog.length - unclassified.length}`);
  console.log('domain                          total  typed  ids  classified');
  for (const [d, r] of rows) console.log(`${d.padEnd(30)} ${String(r.total).padStart(6)} ${String(r.typed).padStart(6)} ${String(r.ids).padStart(4)} ${String(r.classified).padStart(10)}`);
  console.log(`wrote ${OUT}`);
}
process.exit(0);
