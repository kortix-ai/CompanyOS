import { spawn } from 'bun';
import { spawn as spawnChild } from 'node:child_process';
import { constants as fsConstants, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { cp, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run, which } from './exec';

export async function ensureRuntimeArtifacts(worktreePath: string): Promise<number> {
  const packageBuilds: Array<[string, string]> = [
    ['sandbox agent', 'kortixd'],
    ['CLI', '@kortix/cli'],
  ];
  for (const [label, filter] of packageBuilds) {
    if (filter === 'kortixd' && agentArtifactCurrent(worktreePath)) {
      console.log(`  ${label} runtime artifact is current — not rebuilt`);
      continue;
    }
    console.log(`  building ${label} runtime artifact`);
    const code = await run(['pnpm', '--filter', filter, 'build'], { cwd: worktreePath });
    if (code !== 0) return code;
  }
  const [label, script] = ['Apps runtime', 'apps/kortix-app-runtime/build.sh'];
  // The Apps runtime is a Go binary that only the local full stack consumes.
  // A box without Go (a Kortix session sandbox) still gets a usable worktree.
  if (!which('go')) {
    console.warn(`  skipping ${label} runtime artifact: go is not installed (Kortix Apps will not run in this worktree)`);
    return 0;
  }
  console.log(`  building ${label} runtime artifact`);
  const code = await run(['bash', script], { cwd: worktreePath });
  if (code !== 0) return code;
  return 0;
}

/** The sandbox agent package, and the bun metafile its scripts/build.sh writes next to the binary: every module the bundle read. */
const AGENT_PKG = 'apps/kortix-sandbox-agent-server';
const AGENT_META = 'dist/kortix-agent.meta.json';

/**
 * True when the sandbox agent binary is newer than every input of its last build, so `pnpm --filter kortixd build`
 * would only reproduce it. `pnpm worktree start` runs right after `create` built it, and again on every restart:
 * 7.2 s each time on a 6 vCPU Kortix session (2026-11-26), almost all of it `bun build --compile`.
 *
 * Inputs: every module the bundle read, as the build's metafile lists them (one that is gone reads as a change), the
 * package's package.json and tsconfig.json, and the root pnpm-lock.yaml, package.json and tsconfig.base.json, which
 * move on a dependency bump. A file the bundle never read does not count: the CLI build that runs next rewrites
 * packages/starter/src/embedded.generated.json. A new file enters the bundle only through an edit to a file already
 * in it, which counts. No metafile (a Bun without --metafile, or a build from before it) means rebuild.
 */
export function agentArtifactCurrent(worktreePath: string): boolean {
  const pkg = join(worktreePath, AGENT_PKG);
  let built = Infinity;
  let modules: string[];
  try {
    for (const out of ['dist/kortixd', 'dist/kortix-agent']) built = Math.min(built, statSync(join(pkg, out)).mtimeMs);
    const meta = JSON.parse(readFileSync(join(pkg, AGENT_META), 'utf8')) as { inputs?: Record<string, unknown> };
    modules = Object.keys(meta.inputs ?? {}).filter((m) => !/^[a-z]+:/.test(m)); // not bun: builtins
  } catch {
    return false;
  }
  if (modules.length === 0) return false;
  const required = [...modules.map((m) => resolve(pkg, m)), join(pkg, 'package.json'), join(pkg, 'tsconfig.json')];
  for (const file of required) {
    try { if (statSync(file).mtimeMs >= built) return false; } catch { return false; }
  }
  for (const file of ['pnpm-lock.yaml', 'package.json', 'tsconfig.base.json'].map((f) => join(worktreePath, f))) {
    try { if (statSync(file).mtimeMs >= built) return false; } catch { /* optional at the root */ }
  }
  return true;
}

// Spawn `cmd`, drain its stdout+stderr and resolve the first regex match (the
// tunnel URL and the stripe signing secret both print to the child's output).
// Piping in-memory avoids a temp file entirely — no predictable /tmp path to leak
// the `whsec_` secret through and no create-then-read race. The process is left
// running on a match; the caller owns its lifecycle. A miss kills it. Null when
// the binary is missing or nothing matched within `attempts` seconds.
export async function spawnForFirstMatch(
  cmd: [string, ...string[]],
  re: RegExp,
  attempts: number,
): Promise<{ match: string; proc: ReturnType<typeof Bun.spawn> } | null> {
  if (!which(cmd[0])) return null;
  const proc = spawn(cmd, {
    stdout: 'pipe', stderr: 'pipe', stdin: 'ignore',
  });
  let buf = '';
  const pump = async (stream: ReadableStream<Uint8Array> | null | undefined) => {
    if (!stream) return;
    const dec = new TextDecoder();
    try {
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        // The pumps outlive the match so the child's pipes stay drained for
        // its whole life (a full pipe stalls cloudflared). Keep the tail only.
        if (buf.length > 65_536) buf = buf.slice(-32_768);
      }
    } catch { /* stream closed when the process is killed */ }
  };
  void pump(proc.stdout as ReadableStream<Uint8Array>);
  void pump(proc.stderr as ReadableStream<Uint8Array>);
  for (let i = 0; i < attempts; i++) {
    const m = buf.match(re);
    if (m) return { match: m[0], proc };
    if (proc.exitCode !== null) break;
    await Bun.sleep(1000);
  }
  try { proc.kill(); } catch {}
  return null;
}

export interface Tunnel { url: string; proc: ReturnType<typeof Bun.spawn>; }

/** True when the quick tunnel's public URL answers the API health route. */
export async function tunnelAnswers(url: string, apiPath = '/v1/health', timeoutMs = 8000): Promise<boolean> {
  try {
    const r = await fetch(`${url}${apiPath}`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function startTunnel(apiPort: number): Promise<Tunnel | null> {
  // `--protocol http2`: quick tunnels default to QUIC, and on a UDP-hostile or
  // congested path the single QUIC connection drops and never re-registers —
  // the hostname dies while the process lives (2026-08-22: five quick tunnels
  // died within 10–30 min each; cloudflared metrics showed
  // quic_client_congestion_state 3 on every one). HTTP/2 rides TCP/443 and
  // reconnects like any HTTPS client. The watchdog still covers a real death.
  const hit = await spawnForFirstMatch(['cloudflared', 'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${apiPort}`], /https:\/\/[a-z0-9.-]+\.trycloudflare\.com/, 30);
  return hit && { url: hit.match, proc: hit.proc };
}

export interface StripeListen { secret: string; proc: ReturnType<typeof Bun.spawn>; }

// Forward Stripe (test-mode) webhooks to THIS worktree's API — the shared
// `pnpm stripe:listen` is hardcoded to :8008, so without this a worktree's
// checkout/subscription webhooks would never reach its own API. Captures the
// `whsec_…` signing secret `stripe listen` prints so the handler can verify
// signatures. Returns null if the stripe CLI is missing or not logged in
// (`stripe login`), in which case it just times out.
export async function startStripeListen(apiPort: number): Promise<StripeListen | null> {
  const forwardTo = `http://localhost:${apiPort}/v1/billing/webhooks/stripe`;
  const hit = await spawnForFirstMatch(['stripe', 'listen', '--forward-to', forwardTo], /whsec_[A-Za-z0-9]+/, 20);
  return hit && { secret: hit.match, proc: hit.proc };
}

/**
 * Start the web app's /docs build (apps/web/scripts/blume-docs.mjs) in a detached child, from `worktree create`
 * right after the install, so it is done before the first page compiles instead of running beside it. next.config.ts builds /docs
 * whenever public/docs/ is stale, which it always is in a new worktree, and on a 6 vCPU Kortix session
 * (2026-11-26) that build cost the first page 28 s when it ran synchronously and still slowed the compile when it
 * ran beside it. Its lock makes a later next.config.ts build wait for this one and then find the output fresh.
 * Returns false, starting nothing, when the worktree has no docs build or public/docs/ already exists.
 */
export function startDocsBuild(worktreePath: string, logPath: string): boolean {
  const mod = join(worktreePath, 'apps', 'web', 'scripts', 'blume-docs.mjs');
  if (!existsSync(mod) || existsSync(join(worktreePath, 'apps', 'web', 'public', 'docs', 'index.html'))) return false;
  const node = which('node') ? 'node' : process.execPath;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    const log = openSync(logPath, 'w');
    const child = spawnChild(node, ['-e', `import(${JSON.stringify(pathToFileURL(mod).href)}).then((m) => m.buildBlumeDocs())`], {
      cwd: join(worktreePath, 'apps', 'web'), detached: true, stdio: ['ignore', log, log],
    });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false; // next.config.ts still builds /docs itself.
  }
}

const TURBOPACK_CACHE = join('apps', 'web', '.next', 'dev', 'cache');

/**
 * Newest write of a checkout's Turbopack dev cache: the mtime of its newest `turbopack/<version>/CURRENT`
 * whose folder holds data besides it, or 0. A dev server writes a bare CURRENT at once and the data later.
 */
function turbopackCacheWrittenAt(checkout: string): number {
  const root = join(checkout, TURBOPACK_CACHE, 'turbopack');
  let newest = 0;
  try {
    for (const version of readdirSync(root)) {
      try {
        if (readdirSync(join(root, version)).length < 2) continue;
        newest = Math.max(newest, statSync(join(root, version, 'CURRENT')).mtimeMs);
      } catch { /* not written yet */ }
    }
  } catch { /* no cache */ }
  return newest;
}

function readCurrents(cache: string): string {
  try {
    return readdirSync(join(cache, 'turbopack')).sort().map((v) => {
      try { return `${v}:${readFileSync(join(cache, 'turbopack', v, 'CURRENT'), 'utf8')}`; } catch { return `${v}:`; }
    }).join('|');
  } catch { return ''; }
}

/**
 * Give a new worktree's web app the newest Turbopack dev cache among `sources` (other checkouts of the
 * repository), so its first page compiles warm. Measured on a 6 vCPU Kortix session (2026-11-27): the
 * first page after the API took 64-66 s cold and 33.2 s from a cache copied in 4.7-7.2 s. It works
 * because next.config.ts passes Turbopack relative loader paths (apps/web/src/config/turbopack-portable-loaders.ts).
 * Turbopack writes the cache only after a dev server has run for a while (about 20 s to 5 min measured),
 * so a source qualifies once it has a `CURRENT`.
 *
 * The copy goes to a temporary folder and is renamed into place, so an interrupted create leaves no
 * half cache for `next dev` to fail restoring. It is dropped when the source's `CURRENT` changed during
 * the copy (a running dev server wrote it). Returns the source used, or null when the worktree already
 * has a cache, no source has one, or the copy failed.
 */
export async function seedTurbopackCache(worktreePath: string, sources: string[]): Promise<string | null> {
  const target = join(worktreePath, TURBOPACK_CACHE);
  if (existsSync(target)) return null;
  const self = resolve(worktreePath);
  const best = [...new Set(sources.map((s) => resolve(s)))]
    .filter((s) => s !== self)
    .map((s) => ({ s, at: turbopackCacheWrittenAt(s) }))
    .filter((c) => c.at > 0)
    .sort((a, b) => b.at - a.at)[0];
  if (!best) return null;
  const source = join(best.s, TURBOPACK_CACHE);
  const staging = `${target}.seeding-${process.pid}`;
  try {
    const before = readCurrents(source);
    await rm(staging, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    await cp(source, staging, { recursive: true, mode: fsConstants.COPYFILE_FICLONE, preserveTimestamps: true });
    if (readCurrents(source) !== before) throw new Error('source cache changed during the copy');
    if (existsSync(target)) throw new Error('target cache appeared during the copy');
    await rename(staging, target);
    return best.s;
  } catch {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    return null; // next dev compiles cold, as before.
  }
}
