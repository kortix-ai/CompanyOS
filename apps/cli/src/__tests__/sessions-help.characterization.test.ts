import { createHash } from 'node:crypto';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Characterization of the sessions family's help decision (KRTX-4804): for
 * every subcommand whose runner hand-rolls the `-h` / `--help` check, pin the
 * exact `--help` stdout (sha256), its exit code and its trailing newlines,
 * plus every subcommand's bare-invocation exit code, so the checks can move
 * onto `splitHelp` verifiably. The real CLI process, hermetic (no config, no
 * network, stdin ignored).
 *
 * `help` (formatHelp) renders every help text with a leading newline and one
 * trailing blank line, so a canonical `--help` output ends with exactly two
 * newlines. The 7 commands whose guard appends `${HELP}\n` end with three
 * until the unification; their pins say 3 and change to 2 with it.
 *
 * Bare invocations pin the exit code (and, where a bare invocation already
 * prints the help text or must keep doing the command's real work, the
 * stdout shape too): `cp` and `wait-for` print their help bare; `chat`, `log`,
 * `status`, `digest` and `shell` do real work bare (resolve or report a
 * session), so a bare invocation must never become a help print.
 */

const CLI_ROOT = resolve(import.meta.dir, '..', '..');
const CLI_ENTRY = join(CLI_ROOT, 'src', 'index.ts');

let dir = '';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const trailingNewlines = (s: string) => /(\n+)$/.exec(s)?.[1].length ?? 0;

interface Pin {
  /** The bare-invocation exit code. */
  bare: number;
  /** sha256 of the exact `--help` stdout. */
  helpSha: string;
  /** Trailing newlines of the `--help` stdout (2 = formatHelp's one blank line). */
  helpTrailing: number;
  /** What a bare invocation writes to stdout, where that must not change. */
  bareBytes?: 'help' | 'empty';
}

const PINS: Record<string, Pin> = {
  // The 7 guards that append a stray newline: `--help` ends with three.
  chat: { bare: 1, helpSha: 'af38cb169cbbf8739234c04b756d9867adb93e772057e3c56c165560f74d4e6e', helpTrailing: 3, bareBytes: 'empty' },
  log: { bare: 1, helpSha: 'afeb507809e62559ca51c87fb1244162af5c18a24caba455fc290072888c45f2', helpTrailing: 3, bareBytes: 'empty' },
  status: { bare: 1, helpSha: 'f5b7190b144ff83170c9172eb680bd2bb47c616bce7ed66dd7572830075a9d12', helpTrailing: 3, bareBytes: 'empty' },
  digest: { bare: 1, helpSha: '41bd9c00910b27559479ef7f4ceae8f571da33851f733980ae5bb15cd66038d5', helpTrailing: 3, bareBytes: 'empty' },
  forward: { bare: 2, helpSha: '4c8b85956e5056364039199991d0c1065371aecdcc26a5d88ab7ac36b1fb4a7b', helpTrailing: 3 },
  shell: { bare: 1, helpSha: '8b182c4347ed7d53f49e4decc6ba2146792b197bc3857fea6d5ca540c95a1766', helpTrailing: 3, bareBytes: 'empty' },
  attachments: { bare: 2, helpSha: '40057f3971a51b07a771b0b850ce35efb27168b378d77acd66c4484f71498d33', helpTrailing: 3 },

  // Canonical shape already: `--help` ends with two.
  pending: { bare: 2, helpSha: '2c11c80895de49241302f71478c81d0bce6df40bcab02ff0cc07c8220f9645b3', helpTrailing: 2 },
  approve: { bare: 2, helpSha: 'dc12cdc172d1c4613cc155486dec12b0ea68ecb00c96c03991c7edccb943d7e4', helpTrailing: 2 },
  answer: { bare: 2, helpSha: 'f56c86211bced1c3d7531eb3b82b0889251de89b3c98c0ee95658605f92634e1', helpTrailing: 2 },
  approvals: { bare: 2, helpSha: '65b3a5675a051f2a856d00c24e56d5214a0905bb653ed7ac3724678c77de3fd8', helpTrailing: 2 },
  cp: { bare: 2, helpSha: 'd7a53a21e6591c386a5af4c868dc69cff0ec084f2e76fd5f6b641fff1b5a0ec9', helpTrailing: 2, bareBytes: 'help' },
  stop: { bare: 2, helpSha: 'd7f06d7a478438a30a1f30136969082e740a0cf197ba650a9435a24436248738', helpTrailing: 2 },
  start: { bare: 2, helpSha: 'fc37a9895a4033ce54aac8cfe7279c937dbe1e7e746d51de062dad5ee32af342', helpTrailing: 2 },
  restore: { bare: 2, helpSha: '4ef80b50c8cd6ab9e2ca1523a8dc863c7af7dfcab6bc0b9770e1fd7fb23369ee', helpTrailing: 2 },
  recover: { bare: 2, helpSha: '830ab1b89ca9a3907a29e2329b3b04f5dc6c61c97a9f39aa2d41157fdda35080', helpTrailing: 2 },
  model: { bare: 2, helpSha: '771511ba280e0a606b36a83cd0cba29dba939cb134470f81bada615b27539884', helpTrailing: 2 },
  compact: { bare: 2, helpSha: 'a5d0b1abfd4003235499140032d54cdbf0c181a08718b80fdc1ffd498d6fd4cb', helpTrailing: 2 },
  queue: { bare: 2, helpSha: '165125be3cb823515f69e2a44143ac1d80d646d39832382d974066a2247729af', helpTrailing: 2 },
  files: { bare: 2, helpSha: '49f8fa5645ff956545afdcbec8a577c8de1b127a1abcff4fcab39a9e0308aaf7', helpTrailing: 2 },
  share: { bare: 2, helpSha: '2f62b3b7ab54ef4ac12f1523577964169e55f67c844ef947b77ab860191e5386', helpTrailing: 2 },
  links: { bare: 2, helpSha: '6880e58aa8160b7d36c4c24e064fa1ed277c34638cd966f94b7742681e1caf31', helpTrailing: 2 },
  'wait-for': { bare: 2, helpSha: '1f8f17ba3961f6deecace824b589c9943f6748ac62fbd64f953c3714ddda8d18', helpTrailing: 2, bareBytes: 'help' },
  scope: { bare: 2, helpSha: '0a867b789ae8e1d62923e5e2b91eb25cf9b1ae9a2431c0a977035c24d784335a', helpTrailing: 2 },
  message: { bare: 2, helpSha: '6a8f5e03833b1bf39d3a0ff6431c5e716ac738d9ca7b3cd5321653aee680c357', helpTrailing: 2 },
};

/** The group help's sha: bare `sessions`, `<sub> --help` behind the group
 *  guard and the group's own `--help` all print the same bytes. */
const GROUP_HELP_SHA = '2ed05b6e020d3d0e9ed2bd52cce7b7183a52921c57123ad1cd5fcae7fd19d108';

async function runCli(args: string[]) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    KORTIX_NO_UPDATE_CHECK: '1',
    KORTIX_DISABLE_SANDBOX_ENV_FILE: '1',
    NO_COLOR: '1',
    // A path that does not exist: the CLI is NOT logged in for this run, so
    // every case here exits before any network call.
    KORTIX_CONFIG_FILE: join(dir, 'missing-config.json'),
  };
  for (const key of ['KORTIX_API_URL', 'KORTIX_TOKEN', 'KORTIX_PROJECT_ID', 'KORTIX_SESSION_ID', 'KORTIX_FEATURE_FLAGS', 'BASH_ENV']) delete env[key];
  const proc = Bun.spawn({
    cmd: [process.execPath, CLI_ENTRY, ...args],
    cwd: dir,
    env: env as Record<string, string>,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => proc.kill(9), 15_000);
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  return { code, stdout, stderr };
}

describe('sessions subcommand --help and bare invocation (KRTX-4804)', () => {
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  for (const [sub, pin] of Object.entries(PINS)) {
    test(`${sub} --help prints its help text, exit 0`, async () => {
      const result = await runCli(['sessions', sub, '--help']);
      expect(result.code).toBe(0);
      expect(sha(result.stdout)).toBe(pin.helpSha);
      expect(trailingNewlines(result.stdout)).toBe(pin.helpTrailing);
    });

    test(`${sub} bare exits ${pin.bare}${pin.bareBytes ? ' with its pinned stdout' : ''}`, async () => {
      const result = await runCli(['sessions', sub]);
      expect(result.code).toBe(pin.bare);
      if (pin.bareBytes === 'help') expect(sha(result.stdout)).toBe(pin.helpSha);
      if (pin.bareBytes === 'empty') expect(result.stdout).toBe('');
    });
  }

  describe('the group guard', () => {
    test('bare `sessions` prints the group help, exit 2', async () => {
      const result = await runCli(['sessions']);
      expect(result.code).toBe(2);
      expect(sha(result.stdout)).toBe(GROUP_HELP_SHA);
      expect(trailingNewlines(result.stdout)).toBe(2);
    });

    for (const args of [['ls'], ['info'], ['xyz']]) {
      test(`sessions ${args[0]} --help prints the group help, exit 0`, async () => {
        const result = await runCli(['sessions', ...args, '--help']);
        expect(result.code).toBe(0);
        expect(sha(result.stdout)).toBe(GROUP_HELP_SHA);
        expect(trailingNewlines(result.stdout)).toBe(2);
      });
    }
  });
});
