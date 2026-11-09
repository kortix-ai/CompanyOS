import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

// The machine-readable contract of `--json`, black-box: the real CLI process
// against a real local API. A `--json` invocation must emit pure JSON on
// stdout and nothing human on stderr, so every capture style pipes cleanly —
// `kortix whoami --json | jq` AND `kortix whoami --json 2>&1 | jq` (a merged
// capture is how the acct-switch-list dogfood journey saw the human host
// notice as line 1 and jq die on it). Human mode keeps the notice.
//
// Machine mode never swallows the command's own diagnostics: an auth failure
// still prints on stderr and exits non-zero.

const CLI_ENTRY = resolve(import.meta.dir, '..', 'index.ts');

const HOST_NAME = 'test';
const EMAIL = 'owner@example.test';
const TOKEN = 'kortix_pat_machine_contract';
const REVOKED_TOKEN = 'kortix_pat_revoked';

interface MeShape {
  user_id: string;
  email: string;
  token_context: Record<string, unknown>;
  accounts: Array<{ account_id: string; slug: string; name: string; role: string }>;
}

const ME: MeShape = {
  user_id: '11111111-1111-4111-8111-111111111111',
  email: EMAIL,
  token_context: {
    auth_type: 'pat',
    project_id: null,
    session_id: null,
    agent: null,
    connectors: [],
    kortix_permissions: ['projects:read'],
    kortix_cli: ['projects:read'],
  },
  accounts: [
    { account_id: 'aaaaaaaa-1111-4111-8111-111111111111', slug: 'acme', name: 'Acme', role: 'owner' },
    { account_id: 'bbbbbbbb-2222-4222-8222-222222222222', slug: 'beta', name: 'Beta', role: 'member' },
  ],
};

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

let server: ReturnType<typeof Bun.serve> | null = null;
let bigServer: ReturnType<typeof Bun.serve> | null = null;
let apiPort = 0;
let bigApiPort = 0;

function startApi(): void {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (req.headers.get('authorization') !== `Bearer ${TOKEN}`) {
        return Response.json({ error: 'unauthenticated' }, { status: 401 });
      }
      if (new URL(req.url).pathname.endsWith('/me')) {
        return Response.json(ME);
      }
      return Response.json({ error: 'not found' }, { status: 404 });
    },
  });
  // `Server.port` is `number | undefined` in @types/bun (unix sockets); a TCP
  // server on an ephemeral port always has one. `?? 0` degrades to a loud
  // connection-refused failure, never a silently wrong assertion.
  apiPort = server.port ?? 0;
}

/** A person with more memberships than any machine consumer's output budget. */
const MANY_ACCOUNTS = 400;
const ME_MANY: MeShape = {
  ...ME,
  accounts: Array.from({ length: MANY_ACCOUNTS }, (_, i) => ({
    account_id: `aaaaaaaa-${String(i).padStart(4, '0')}-4111-8111-111111111111`,
    slug: `workspace-${i}`,
    name: `workspace number ${i} with a fairly long descriptive name for realism`,
    role: 'member',
  })),
};

function startBigApi(): void {
  bigServer = Bun.serve({
    port: 0,
    async fetch(req) {
      if (req.headers.get('authorization') !== `Bearer ${TOKEN}`) {
        return Response.json({ error: 'unauthenticated' }, { status: 401 });
      }
      if (new URL(req.url).pathname.endsWith('/me')) {
        return Response.json(ME_MANY);
      }
      return Response.json({ error: 'not found' }, { status: 404 });
    },
  });
  bigApiPort = bigServer.port ?? 0;
}

/** A throwaway HOME + multi-host config pointing `test` at the local API. */
function seedConfig(token: string, port: number = apiPort): { dir: string; config: string } {
  const dir = mkdtempSync(join(tmpdir(), 'kortix-whoami-json-'));
  const config = join(dir, 'config.json');
  writeFileSync(
    config,
    JSON.stringify({
      active: HOST_NAME,
      hosts: {
        [HOST_NAME]: {
          url: `http://127.0.0.1:${port}/v1`,
          token,
          user_id: ME.user_id,
          user_email: EMAIL,
          account_id: ME.accounts[0].account_id,
          logged_in_at: '2026-01-01T00:00:00.000Z',
        },
      },
    }),
  );
  return { dir, config };
}

function childEnv(dir: string, config: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: dir,
    KORTIX_CONFIG_FILE: config,
    KORTIX_NO_UPDATE_CHECK: '1',
    KORTIX_DISABLE_SANDBOX_ENV_FILE: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
  };
  for (const key of [
    'KORTIX_API_URL',
    'KORTIX_TOKEN',
    'KORTIX_FRONTEND_URL',
    'KORTIX_PROJECT_ID',
    'KORTIX_SESSION_ID',
    'BASH_ENV',
  ]) {
    delete env[key];
  }
  return env;
}

async function runCli(args: string[], dir: string, config: string): Promise<CliResult> {
  const proc = Bun.spawn({
    cmd: [process.execPath, CLI_ENTRY, ...args],
    cwd: dir,
    env: childEnv(dir, config),
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timeout = setTimeout(() => proc.kill(), 30_000);
  try {
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

describe('machine-readable output (--json) is pure JSON on stdout, silent on stderr', () => {
  const results = new Map<string, CliResult>();
  const dirs: string[] = [];

  beforeAll(async () => {
    startApi();
    startBigApi();
    // One throwaway config per case: the cases run concurrently and must not
    // share a directory one of them would clean up under another.
    const cases: Array<[string, string[], string, number | undefined]> = [
      ['whoami --json', ['whoami', '--json'], TOKEN, undefined],
      ['whoami --host test --json', ['whoami', '--host', HOST_NAME, '--json'], TOKEN, undefined],
      ['accounts ls --json', ['accounts', 'ls', '--json'], TOKEN, undefined],
      ['whoami (human)', ['whoami'], TOKEN, undefined],
      ['whoami --json (revoked token)', ['whoami', '--json'], REVOKED_TOKEN, undefined],
      ['whoami --json (many accounts)', ['whoami', '--json'], TOKEN, bigApiPort],
    ];
    await Promise.all(
      cases.map(async ([name, args, token, port]) => {
        const { dir, config } = seedConfig(token, port);
        dirs.push(dir);
        results.set(name, await runCli(args, dir, config));
      }),
    );
  }, 120_000);

  afterAll(() => {
    server?.stop(true);
    bigServer?.stop(true);
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  const get = (name: string): CliResult => {
    const result = results.get(name);
    if (!result) throw new Error(`case not run: ${name}`);
    return result;
  };

  test('whoami --json: stdout parses as JSON and carries the payload', () => {
    const { code, stdout } = get('whoami --json');
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.user_email).toBe(EMAIL);
    // The identity carries the ACTIVE membership and the count, never the
    // whole list: the list is unbounded and is `accounts ls --json`'s job.
    expect(parsed.account).toMatchObject({ account_id: ME.accounts[0]!.account_id });
    expect(parsed.accounts_count).toBe(ME.accounts.length);
    expect(parsed.accounts).toBeUndefined();
  });

  test('whoami --json: a user with many accounts still arrives whole, under the kortix MCP tool result budget', () => {
    // The MCP `kortix` tool cuts CLI stdout at 45 000 characters; a cut
    // `--json` output loses its `json:` value (release gate MCP-6, run
    // 42716922285). The identity payload must stay far under it no matter how
    // many workspaces the person belongs to.
    const { code, stdout, stderr } = get('whoami --json (many accounts)');
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout.length).toBeLessThan(30_000);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.accounts_count).toBe(MANY_ACCOUNTS);
    expect(JSON.stringify(parsed).length).toBeLessThan(30_000);
  });

  test('whoami --json: stderr is empty', () => {
    expect(get('whoami --json').stderr).toBe('');
  });

  test('whoami --host test --json: stdout parses as JSON, stderr is empty', () => {
    const { code, stdout, stderr } = get('whoami --host test --json');
    expect(code).toBe(0);
    expect(stderr).toBe('');
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.host).toBe(HOST_NAME);
    expect(parsed.user_email).toBe(EMAIL);
  });

  test('accounts ls --json: stdout parses as a JSON array, stderr is empty', () => {
    const { code, stdout, stderr } = get('accounts ls --json');
    expect(code).toBe(0);
    expect(stderr).toBe('');
    const parsed = JSON.parse(stdout) as unknown[];
    expect(parsed).toHaveLength(2);
  });

  test('human mode keeps the host notice on stderr', () => {
    const { code, stdout, stderr } = get('whoami (human)');
    expect(code).toBe(0);
    expect(stdout).toContain(EMAIL);
    expect(stderr).toContain(`host ${HOST_NAME}`);
  });

  test('machine mode still reports an auth failure on stderr with a non-zero exit', () => {
    const { code, stdout, stderr } = get('whoami --json (revoked token)');
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Token rejected');
  });
});
