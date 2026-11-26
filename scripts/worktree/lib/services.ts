import { spawn } from 'bun';
import { spawn as spawnChild } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

/** Directories an mtime walk of build inputs skips: build output and installed dependencies (the lockfile stands for those). */
const NOT_INPUTS = new Set(['dist', 'node_modules', '.turbo', '.next']);

/** Newest mtime (ms) of `path` or of anything under it outside NOT_INPUTS; 0 when it does not exist. A directory
 * below `path` counts too, so deleting a source file (which moves only its directory's mtime) reads as a change.
 * `path`'s own mtime does not: `bun build --compile` stages its binary in the package root and renames it into dist/. */
export function newestInputMtimeMs(path: string, root = true): number {
  let s;
  try { s = statSync(path); } catch { return 0; }
  if (!s.isDirectory()) return s.mtimeMs;
  let newest = root ? 0 : s.mtimeMs;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && NOT_INPUTS.has(entry.name)) continue;
    const m = newestInputMtimeMs(join(path, entry.name), false);
    if (m > newest) newest = m;
  }
  return newest;
}

/** The workspace packages the sandbox agent's bundle reaches through @kortix/* imports, transitively (its sources
 * import @kortix/api-contract, @kortix/sdk and @kortix/shared). runtime-artifacts.test.ts walks the real sources. */
export const AGENT_INPUT_PACKAGES = ['api-contract', 'llm-catalog', 'sdk', 'shared', 'voice'];

/**
 * True when the sandbox agent binary is newer than every input of its build, so `pnpm --filter kortixd build`
 * would only reproduce it. `pnpm worktree start` runs right after `create` built it, and again on every restart:
 * 7.2 s each time on a 6 vCPU Kortix session (2026-11-26), almost all of it `bun build --compile`.
 *
 * Inputs: the package itself, AGENT_INPUT_PACKAGES, and the root lockfile, package.json and tsconfig.base.json, which
 * move on a dependency bump. Not all of packages/: the CLI build, which runs next, rewrites
 * packages/starter/src/embedded.generated.json. An edit, a branch switch or a checkout rewrites an input's mtime, so
 * each of those rebuilds.
 */
export function agentArtifactCurrent(worktreePath: string): boolean {
  const pkg = join(worktreePath, 'apps/kortix-sandbox-agent-server');
  let built = Infinity;
  for (const out of ['dist/kortixd', 'dist/kortix-agent']) {
    try { built = Math.min(built, statSync(join(pkg, out)).mtimeMs); } catch { return false; }
  }
  const inputs = [pkg, ...AGENT_INPUT_PACKAGES.map((p) => join(worktreePath, 'packages', p)),
    ...['pnpm-lock.yaml', 'package.json', 'tsconfig.base.json'].map((f) => join(worktreePath, f))];
  return inputs.every((input) => newestInputMtimeMs(input) < built);
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
 * Start the web app's /docs build (apps/web/scripts/blume-docs.mjs) in a detached child, so it runs while
 * `worktree start` waits on Supabase instead of beside the first page's compile. next.config.ts builds /docs
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
