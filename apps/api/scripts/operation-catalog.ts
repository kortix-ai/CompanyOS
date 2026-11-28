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
import { app } from '../src/index';
import { RETIRED_ROUTES } from '../src/routes/retired';
import { EXPOSURES, type Exposure, concreteRoutes, openApiOperations, routeKey as key } from '../src/shared/operation-registry';

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
// A retired route answers 410 with the route that replaced it: not an operation.
const retired = new Set(RETIRED_ROUTES.map(([method, path]) => key(method, path)));
const isExcluded = (k: string) => k in excluded || retired.has(k);

export function buildCatalog(): CatalogEntry[] {
  const operation = openApiOperations(app as never);
  return concreteRoutes(app as never, false)
    .map((r) => {
      const op = operation(r.method, r.path);
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

export const classified = (e: CatalogEntry) => Boolean(e.operation_id && e.action && e.exposure) || isExcluded(key(e.method, e.path));

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
    // One route object mounted twice is one operation: its excluded alias path is not a second id.
    const named = catalog.filter((e) => e.operation_id && !isExcluded(key(e.method, e.path)));
    const duplicate = named.filter((e) => (ids.has(e.operation_id!) ? true : (ids.set(e.operation_id!, key(e.method, e.path)), false)));
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
