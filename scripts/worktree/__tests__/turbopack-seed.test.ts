// seedTurbopackCache: `pnpm worktree create` copies the newest Turbopack dev cache of another checkout into the new one.
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedTurbopackCache } from '../lib/services';

const CACHE = 'apps/web/.next/dev/cache';
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function checkout(): string {
  const d = mkdtempSync(join(tmpdir(), 'wt-tp-'));
  dirs.push(d);
  return d;
}

/** A checkout whose cache was written at `at` (seconds); `bare` leaves only CURRENT, as a dev server does at once. */
function withCache(at: number, tag: string, bare = false): string {
  const d = checkout();
  const v = join(d, CACHE, 'turbopack', 'v16.4.5-test');
  mkdirSync(v, { recursive: true });
  writeFileSync(join(v, 'CURRENT'), tag);
  if (!bare) writeFileSync(join(v, '00000001.sst'), `data ${tag}`);
  const when = new Date(1_800_000_000_000 + at * 1000);
  utimesSync(join(v, 'CURRENT'), when, when);
  return d;
}

const current = (d: string) => readFileSync(join(d, CACHE, 'turbopack', 'v16.4.5-test', 'CURRENT'), 'utf8');

describe('seedTurbopackCache', () => {
  test('copies the newest written cache into the new worktree', async () => {
    const older = withCache(10, 'older');
    const newer = withCache(20, 'newer');
    const wt = checkout();
    expect(await seedTurbopackCache(wt, [older, newer])).toBe(newer);
    expect(current(wt)).toBe('newer');
    expect(readFileSync(join(wt, CACHE, 'turbopack', 'v16.4.5-test', '00000001.sst'), 'utf8')).toBe('data newer');
    expect(readdirSync(join(wt, 'apps/web/.next/dev'))).toEqual(['cache']);
  });

  test('skips a cache that holds only CURRENT, the worktree itself and checkouts without a cache', async () => {
    const bare = withCache(30, 'bare', true);
    const written = withCache(5, 'written');
    const wt = checkout();
    expect(await seedTurbopackCache(wt, [bare, checkout(), wt, written])).toBe(written);
    expect(current(wt)).toBe('written');
  });

  test('changes nothing when the worktree already has a cache or no source has one', async () => {
    const wt = withCache(1, 'own');
    expect(await seedTurbopackCache(wt, [withCache(99, 'other')])).toBeNull();
    expect(current(wt)).toBe('own');
    const empty = checkout();
    expect(await seedTurbopackCache(empty, [checkout(), withCache(9, 'bare', true)])).toBeNull();
    expect(existsSync(join(empty, 'apps/web/.next'))).toBe(false);
  });
});
