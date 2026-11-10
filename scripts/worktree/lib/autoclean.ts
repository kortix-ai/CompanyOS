/**
 * `autoclean`: automatic disk housekeeping for registered worktrees.
 *
 * Pure rules only. The probes (ports, processes, `git status`, `df`, crontab)
 * live in cli.ts and feed one AutocleanCandidate per registry slot.
 *
 * Measured on 2026-11-10 on a 98 GB /work volume that hit 100%: a worktree
 * holds ~1.3 GB of unshared files (node_modules is 5.6 GB but mostly hardlinks
 * into the pnpm store) plus `apps/web/.next`, which grows without bound under
 * `next dev` (3.4 GB and 7.0 GB in two checkouts).
 */
import { parseDuration } from './prune';

/**
 * Tracked files a running dev server rewrites. A change to one of these alone
 * does not make a checkout dirty, and its mtime is not activity.
 */
export const NOISE_PATHS: readonly string[] = ['apps/web/src/lib/seo/content-timestamps.json'];

export const DEFAULT_SWEEP_IDLE = '24h';
export const DEFAULT_REMOVE_IDLE = '48h';

/** Free space below this on `create`/`start`: warn and name the largest checkouts. */
export const DISK_WARN_BYTES = 10 * 1024 ** 3;
/** Free space below this: `create` refuses with exit 2. */
export const DISK_REFUSE_BYTES = 4 * 1024 ** 3;

/** Trailing marker of the one crontab line `--install-cron` owns. */
export const CRON_MARK = '# kortix-worktree-autoclean';

export interface AutocleanConfig {
  enabled: boolean;
  sweepIdleMs: number;
  removeIdleMs: number;
}

/**
 * KORTIX_WORKTREE_AUTOCLEAN=0 (or false/off/no) turns the automatic run off.
 * KORTIX_WORKTREE_SWEEP_IDLE / KORTIX_WORKTREE_REMOVE_IDLE take `<n>m|h|d|w`.
 * An invalid duration falls back to the default and returns a warning: a typo
 * in an env var must not break `create`.
 */
export function autocleanConfig(env: Record<string, string | undefined>): { config: AutocleanConfig; warnings: string[] } {
  const warnings: string[] = [];
  const dur = (key: string, fallback: string): number => {
    const raw = env[key];
    if (raw === undefined || raw.trim() === '') return parseDuration(fallback);
    try { return parseDuration(raw); } catch {
      warnings.push(`${key}="${raw}" is not <n>m|h|d|w — using ${fallback}`);
      return parseDuration(fallback);
    }
  };
  const off = /^(0|false|off|no)$/i.test((env.KORTIX_WORKTREE_AUTOCLEAN ?? '').trim());
  return {
    config: { enabled: !off, sweepIdleMs: dur('KORTIX_WORKTREE_SWEEP_IDLE', DEFAULT_SWEEP_IDLE), removeIdleMs: dur('KORTIX_WORKTREE_REMOVE_IDLE', DEFAULT_REMOVE_IDLE) },
    warnings,
  };
}

export interface StatusEntry { xy: string; path: string }

/**
 * `git status --porcelain` (v1) → entries. A rename `R  old -> new` yields the
 * new path. Quoted paths (`"a b"`) are unquoted; C escapes are left as written.
 */
export function parsePorcelain(stdout: string): StatusEntry[] {
  const out: StatusEntry[] = [];
  for (const line of stdout.split('\n')) {
    if (line.length < 4) continue;
    const xy = line.slice(0, 2);
    let path = line.slice(3);
    const arrow = path.indexOf(' -> ');
    if (arrow >= 0 && (xy[0] === 'R' || xy[0] === 'C')) path = path.slice(arrow + 4);
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    out.push({ xy, path: path.replace(/\/$/, '') });
  }
  return out;
}

export function isNoise(path: string, noise: readonly string[] = NOISE_PATHS): boolean {
  return noise.includes(path);
}

/** The status entries that are real work: everything except NOISE_PATHS. */
export function meaningfulChanges(entries: StatusEntry[], noise: readonly string[] = NOISE_PATHS): StatusEntry[] {
  return entries.filter((e) => !isNoise(e.path, noise));
}

/**
 * Last activity of a checkout, in epoch ms: the newest of registry createdAt,
 * registry lastUsedAt (create/start/web/stop), the HEAD commit time, and the
 * mtime of each changed non-noise file. A read (`git status`, `ls`, an editor
 * opening a file) changes none of these. The worktree index mtime is not used:
 * a read-only `git status` refreshes it. Null when nothing is known.
 */
export function lastActivity(input: {
  createdAt?: string;
  lastUsedAt?: string;
  headCommitMs?: number | null;
  changedMtimesMs?: number[];
}): number | null {
  const xs = [
    input.createdAt ? Date.parse(input.createdAt) : NaN,
    input.lastUsedAt ? Date.parse(input.lastUsedAt) : NaN,
    input.headCommitMs ?? NaN,
    ...(input.changedMtimesMs ?? []),
  ].filter((x) => Number.isFinite(x) && x > 0);
  return xs.length ? Math.max(...xs) : null;
}

export interface AutocleanCandidate {
  name: string;
  /** the primary checkout is never touched. */
  primary: boolean;
  /** web or api port answering. */
  live: boolean;
  /** a process runs inside the checkout or names it on its command line. */
  busy: boolean;
  /** registry slot whose directory is gone. */
  missing: boolean;
  /** the directory exists but `git worktree list` does not name it: not ours to touch. */
  unregistered?: boolean;
  /** changed tracked + untracked files that are not NOISE_PATHS. */
  meaningfulChanges: number;
  /** commits on HEAD/the branch that no remote ref contains; null when unknown. */
  unpushed: number | null;
  /** epoch ms, from `lastActivity`; null when unknown. */
  lastActivity: number | null;
  /** the worktree the current command operates on; never removed. */
  current?: boolean;
}

export interface AutocleanVerdict {
  name: string;
  sweep: boolean;
  remove: boolean;
  why: string;
}

const fmtAge = (ms: number) =>
  ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`;

/**
 * Precedence: primary, live and busy checkouts are never touched. A missing
 * directory frees its slot once the slot is idle ≥ removeIdle (a younger slot
 * may be another session's `create` between the registry write and
 * `git worktree add`). Unknown activity touches nothing. Otherwise build
 * output is swept at ≥ sweepIdle, and the whole worktree is removed at
 * ≥ removeIdle when it has no real changes and every commit is on a remote.
 */
export function decideAutoclean(c: AutocleanCandidate, cfg: AutocleanConfig, nowMs: number): AutocleanVerdict {
  const keep = (why: string): AutocleanVerdict => ({ name: c.name, sweep: false, remove: false, why });
  if (c.primary) return keep('primary checkout');
  if (c.live) return keep('stack is running');
  if (c.busy) return keep('a process uses the checkout');
  if (c.unregistered && !c.missing) return keep('not a git worktree of this repo (see pnpm worktree doctor)');
  if (c.lastActivity === null) return keep('unknown activity');
  const idle = nowMs - c.lastActivity;
  const age = `idle ${fmtAge(idle)}`;
  if (c.missing) {
    return idle >= cfg.removeIdleMs
      ? { name: c.name, sweep: false, remove: true, why: `directory missing, ${age} — freeing slot` }
      : keep(`directory missing, ${age} (< ${fmtAge(cfg.removeIdleMs)})`);
  }
  const sweep = idle >= cfg.sweepIdleMs;
  if (idle < cfg.removeIdleMs) return { name: c.name, sweep, remove: false, why: sweep ? `${age} — sweep build output` : `${age} (< ${fmtAge(cfg.sweepIdleMs)})` };
  if (c.current) return { name: c.name, sweep, remove: false, why: `${age} — current worktree, kept` };
  if (c.meaningfulChanges > 0) return { name: c.name, sweep, remove: false, why: `${age} — ${c.meaningfulChanges} uncommitted change(s), kept` };
  if (c.unpushed === null) return { name: c.name, sweep, remove: false, why: `${age} — push state unknown, kept` };
  if (c.unpushed > 0) return { name: c.name, sweep, remove: false, why: `${age} — ${c.unpushed} commit(s) on no remote, kept` };
  return { name: c.name, sweep: false, remove: true, why: `${age}, clean, every commit on a remote — remove` };
}

export type DiskLevel = 'ok' | 'warn' | 'refuse';

export function diskLevel(freeBytes: number, warnBytes = DISK_WARN_BYTES, refuseBytes = DISK_REFUSE_BYTES): DiskLevel {
  if (freeBytes < refuseBytes) return 'refuse';
  if (freeBytes < warnBytes) return 'warn';
  return 'ok';
}

/** `df -Pk <dir>` → free bytes on that filesystem, or null when unparseable. */
export function parseDfFreeBytes(stdout: string): number | null {
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) return null;
  // POSIX output: Filesystem 1024-blocks Used Available Capacity Mounted-on.
  // A long device name never wraps under -P, but may hold spaces: read from the right.
  const cols = lines[lines.length - 1]!.trim().split(/\s+/);
  if (cols.length < 6) return null;
  const avail = Number(cols[cols.length - 3]);
  return Number.isFinite(avail) ? avail * 1024 : null;
}

/**
 * Disk-guard thresholds in bytes. KORTIX_WORKTREE_DISK_WARN_GB and
 * KORTIX_WORKTREE_DISK_REFUSE_GB override the 10 / 4 GB defaults; a value that
 * is not a non-negative number is ignored. Refuse never exceeds warn.
 */
export function diskThresholds(env: Record<string, string | undefined>): { warnBytes: number; refuseBytes: number } {
  const gb = (raw: string | undefined, fallback: number) => {
    const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n * 1024 ** 3 : fallback;
  };
  const warnBytes = gb(env.KORTIX_WORKTREE_DISK_WARN_GB, DISK_WARN_BYTES);
  return { warnBytes, refuseBytes: Math.min(warnBytes, gb(env.KORTIX_WORKTREE_DISK_REFUSE_GB, DISK_REFUSE_BYTES)) };
}

/** Single-quote a string for /bin/sh. */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * The one hourly crontab line: run autoclean --yes from the primary checkout.
 * cron starts with an empty environment, so PATH and KORTIX_HOME are pinned.
 * No `%` may appear: cron turns it into a newline.
 */
export function cronLine(o: { primary: string; bun: string; path: string; kortixHome: string; log: string }): string {
  const cmd = `cd ${shQuote(o.primary)} && PATH=${shQuote(o.path)} KORTIX_HOME=${shQuote(o.kortixHome)} ${shQuote(o.bun)} scripts/worktree/cli.ts autoclean --yes --quiet >> ${shQuote(o.log)} 2>&1`;
  if (cmd.includes('%')) throw new Error('crontab line may not contain "%"');
  return `17 * * * * ${cmd} ${CRON_MARK}`;
}

export function hasCronLine(crontab: string): boolean {
  return crontab.split('\n').some((l) => l.trimEnd().endsWith(CRON_MARK));
}

/** The crontab with our line replaced (idempotent) and every other line kept. */
export function withCronLine(crontab: string, line: string): string {
  const kept = crontab.split('\n').filter((l) => !l.trimEnd().endsWith(CRON_MARK));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  return [...kept, line].join('\n') + '\n';
}

export function withoutCronLine(crontab: string): string {
  const kept = crontab.split('\n').filter((l) => !l.trimEnd().endsWith(CRON_MARK));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  return kept.length ? kept.join('\n') + '\n' : '';
}
