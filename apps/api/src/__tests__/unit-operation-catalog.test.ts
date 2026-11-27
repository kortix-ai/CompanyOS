import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

/**
 * Every concrete API route is in the operation catalog: an operationId, the
 * IAM action it needs and its exposure, or a written exclusion. Every client
 * (the `kortix` connector, MCP, the CLI, the SDK) is generated from it, so an
 * unclassified route is one no client can reach correctly.
 * `apps/api/scripts/operation-catalog.ts`; rules:
 * `.agents/skills/learnings/work/kortix-surface/README.md`.
 */
test('every route is classified in the operation catalog, with unique ids', () => {
  const run = Bun.spawnSync(['bun', 'scripts/operation-catalog.ts', '--check'], {
    cwd: resolve(import.meta.dir, '../..'),
    env: {
      ...process.env,
      SUPABASE_URL: 'https://placeholder.supabase.co',
      INTERNAL_KORTIX_ENV: 'dev',
      KORTIX_BILLING_INTERNAL_ENABLED: 'true',
      FRONTEND_URL: 'https://placeholder.kortix.com',
      KORTIX_CONFIG_ARCHIVE_S3_ENDPOINT: 'https://placeholder.storage.example',
      PLATINUM_INFERENCE_URL: 'https://placeholder.platinum.example/v1/inference',
    },
  });
  const out = `${run.stdout.toString()}${run.stderr.toString()}`;
  const verdict = out.split('\n').filter((l) => /operation catalog:|not classified|classified now|duplicate|exclusions name|^ {2}[A-Z]+ \//.test(l));
  expect(verdict.join('\n'), out.slice(-2000)).toContain('0 on the shrinking baseline');
  expect(run.exitCode).toBe(0);
}, 120_000);
