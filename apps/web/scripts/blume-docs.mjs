import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// /docs is a Blume (Astro) static site built from `content/docs/` +
// `blume.config.ts`. `blume build` writes its output to `dist/` at the repo
// root of apps/web. Its `deployment.base` config leaves pages FLAT at the
// dist root (verified: `dist/index.html`, `dist/audit-actions/index.html`) rather than nested under a `dist/docs/` subfolder —
// so the whole `dist/` directory, not a subdirectory of it, is what gets
// copied into `public/docs/`.
//
// Single source of truth for the build + copy: next.config.ts imports this
// module directly (belt-and-suspenders, same pattern as scripts/viewer-wasm.mjs
// and scripts/emojibase-data.mjs) so the docs site is guaranteed to exist
// before `next build` finishes, even though Vercel's buildCommand is a bare
// `next build` that never runs an npm script.
const WEB_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(WEB_ROOT, 'dist');
const PUBLIC_DOCS = path.join(WEB_ROOT, 'public', 'docs');
const CONTENT_DOCS = path.join(WEB_ROOT, 'content', 'docs');
const BLUME_CONFIG = path.join(WEB_ROOT, 'blume.config.ts');
// The custom components Blume renders (components.ts registers them), so a
// sidebar change rebuilds the docs too.
const BLUME_COMPONENTS = [path.join(WEB_ROOT, 'components.ts'), path.join(WEB_ROOT, 'blume-components')];

/** Absolute paths of the `public/docs/` files that prove the Blume build landed. */
export function getBlumeDocsOutputPaths() {
  return [
    path.join(PUBLIC_DOCS, 'index.html'),
    // The docs are one page (index.html); audit-actions is the nested page
    // that proves the rest of the site landed too.
    path.join(PUBLIC_DOCS, 'audit-actions', 'index.html'),
  ];
}

/** Most recent mtime (ms) of any file under `root`, or of `root` itself if it's a file. */
function newestMtimeMs(root) {
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(root)) {
    const childMtime = newestMtimeMs(path.join(root, entry));
    if (childMtime > newest) newest = childMtime;
  }
  return newest;
}

/**
 * True when `public/docs/index.html` already reflects the current
 * `content/docs/`, `blume.config.ts` and custom component sources, so the (tens-of-seconds)
 * `blume build` can be skipped.
 *
 * next.config.ts loads once in the main `next build` process and again,
 * independently, in each forked static-generation worker — every load calls
 * `buildBlumeDocs()`. Those forks are separate OS processes with no shared
 * memory, so the only reliable place to dedupe across them is the
 * filesystem: skip the rebuild if the output is no older than every input.
 */
function isPublicDocsUpToDate() {
  const outputIndex = getBlumeDocsOutputPaths()[0];
  if (!fs.existsSync(outputIndex)) return false;
  const outputMtime = fs.statSync(outputIndex).mtimeMs;
  return [CONTENT_DOCS, BLUME_CONFIG, ...BLUME_COMPONENTS].every((source) => outputMtime >= newestMtimeMs(source));
}

/**
 * Build the Blume docs site (`npx blume build`) and copy its flat `dist/`
 * output into `public/docs/`, replacing whatever was there before.
 *
 * No-ops when `public/docs/` is already at least as new as its sources (see
 * `isPublicDocsUpToDate`) — otherwise every one of `next build`'s forked
 * static-generation workers would redundantly rerun the full Astro build.
 *
 * Throws if `blume build` fails or if `dist/` does not exist afterward.
 * Callers (next.config.ts) decide whether that is fatal — see the
 * `getBlumeDocsOutputPaths()` existence check there, which tolerates a slim
 * prod image that ships `public/` but not the `content/docs/` build inputs.
 */
export function buildBlumeDocs() {
  if (isPublicDocsUpToDate()) return;
  // Two processes that both see stale output (parallel test files, `next build`
  // workers) would run `blume build` into one dist/ at once and break each
  // other's chunks. mkdir is atomic: one process builds, the others wait and
  // then find the output fresh.
  const lock = path.join(WEB_ROOT, '.blume-build.lock');
  const deadline = Date.now() + BUILD_LOCK_WAIT_MS;
  while (true) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      // ponytail: a lock older than the wait budget belongs to a dead process.
      if (Date.now() - fs.statSync(lock, { throwIfNoEntry: false })?.mtimeMs > BUILD_LOCK_WAIT_MS) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`blume docs build lock held longer than ${BUILD_LOCK_WAIT_MS} ms: ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  try {
    if (isPublicDocsUpToDate()) return;
    execFileSync('npx', ['blume', 'build'], { cwd: WEB_ROOT, stdio: 'inherit' });
    fs.rmSync(PUBLIC_DOCS, { recursive: true, force: true });
    fs.mkdirSync(PUBLIC_DOCS, { recursive: true });
    fs.cpSync(DIST, PUBLIC_DOCS, { recursive: true });
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

const BUILD_LOCK_WAIT_MS = 180_000;

/**
 * `next dev`: start `buildBlumeDocs()` in a detached, low-priority child and return at once, so the dev
 * server's first page does not wait for the docs site. Run synchronously from next.config.ts, the build held
 * back the first compile: on a 6 vCPU Kortix session (2026-11-26) a new worktree, which never has
 * public/docs/, served its first page 88.6 s after its API was up, against 60.7 s with public/docs/ present.
 * /docs answers 404 until the child lands (the build took 19-28 s there). Every process that loads
 * next.config.ts may call this; `buildBlumeDocs`'s lock lets one child build and the others find it fresh.
 * Returns true when it started a build, false when public/docs/ is already current.
 */
export function buildBlumeDocsInBackground() {
  if (isPublicDocsUpToDate()) return false;
  const child = spawn(process.execPath, ['-e', `import(${JSON.stringify(import.meta.url)}).then((m) => m.buildBlumeDocs())`], {
    cwd: WEB_ROOT,
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', (err) => console.warn(`[blume-docs] background docs build did not start: ${err.message}`));
  if (child.pid) {
    try {
      os.setPriority(child.pid, 10);
    } catch {
      // Priority is a courtesy to the first compile; the build runs either way.
    }
  }
  child.unref();
  return true;
}
