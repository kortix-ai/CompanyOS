import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// `kortix tools search|describe|call|execute|resume|skills` against a fake
// `POST /v1/agent-tools/{verb}`: the request each verb sends (path, project_id,
// x-kortix-surface: cli, body), what it prints, and its exit code.

const CLI_ENTRY = join(resolve(import.meta.dir, '..', '..'), 'src', 'index.ts');
const PROJECT = 'proj_tools';
const EXECUTION = '0b5c1b8e-0000-4000-8000-000000000000';

interface Seen {
  path: string;
  projectId: string | null;
  surface: string | null;
  body: any;
}

let tmp: string;
let server: ReturnType<typeof Bun.serve> | null = null;
let seen: Seen[] = [];

function answer(verb: string, body: any): Response {
  switch (verb) {
    case 'search':
      return Response.json({
        results: [
          { id: 'connectors.echo.read_echo', title: 'Read echo', risk: 'read', description: 'Echo text back.', input: 'text: string' },
        ],
        truncated: false,
        next: 'Describe an id for its schema, then call it.',
      });
    case 'describe':
      return body.id === 'connectors.echo.read_echo'
        ? Response.json({ id: body.id, title: 'Read echo', description: 'Echo text back.', risk: 'read', input_schema: { type: 'object' }, output_schema: null })
        : Response.json({ error: `Unknown tool id: ${body.id}`, suggestions: ['connectors.echo.read_echo'] }, { status: 422 });
    case 'call':
      if (body.id === 'connectors.echo.read_echo') return Response.json({ status: 'ok', data: { echo: body.input.text } });
      if (body.id === 'connectors.echo.post_echo') {
        return Response.json({
          status: 'pending_approval',
          execution_id: EXECUTION,
          approval_url: 'http://web.test/review/call',
          runs_on_approval: true,
          next: 'A person approves it.',
        });
      }
      return Response.json({ status: 'denied', reason: 'policy_block', message: 'The project blocks this action.' }, { status: 422 });
    case 'execute':
      return Response.json({ ok: true, value: { sum: 3 }, output: 'started', calls: 1 });
    case 'resume':
      return Response.json({
        execution_id: body.execution_id,
        state: 'pending',
        action: 'echo.post_echo',
        decision: null,
        decided_by: null,
        decided_at: null,
        note: null,
        outcome: null,
        expires_at: '2026-11-12T00:00:00.000Z',
        next: 'Still waiting for a person. Do not repeat the call; read it again later.',
      });
    case 'skills':
      return Response.json({ text: body.name ? `# ${body.name}` : '- kortix-system' });
    default:
      return Response.json({ error: 'unknown_verb' }, { status: 404 });
  }
}

function startServer(): string {
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url);
      const match = /^\/v1\/agent-tools\/([a-z]+)$/.exec(url.pathname);
      if (!match || req.method !== 'POST') return Response.json({ error: 'not found' }, { status: 404 });
      const body = await req.json();
      seen.push({ path: url.pathname, projectId: url.searchParams.get('project_id'), surface: req.headers.get('x-kortix-surface'), body });
      return answer(match[1]!, body);
    },
  });
  const configFile = join(tmp, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      active: 'test',
      hosts: {
        test: {
          url: `http://127.0.0.1:${server.port}`,
          token: 'tok_tools',
          user_id: 'user_1',
          user_email: 'user@example.test',
          account_id: 'account_1',
          logged_in_at: '2026-01-01T00:00:00.000Z',
        },
      },
    }),
    'utf8',
  );
  return configFile;
}

async function runCli(args: string[], configFile: string, stdin?: string) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    KORTIX_NO_UPDATE_CHECK: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    KORTIX_DISABLE_SANDBOX_ENV_FILE: '1',
    KORTIX_CONFIG_FILE: configFile,
  };
  for (const key of ['KORTIX_API_URL', 'KORTIX_CLI_TOKEN', 'KORTIX_FRONTEND_URL', 'KORTIX_PROJECT_ID', 'KORTIX_TOKEN', 'BASH_ENV']) {
    delete env[key];
  }
  const proc = Bun.spawn({
    cmd: [process.execPath, CLI_ENTRY, 'tools', ...args, '--workspace', PROJECT],
    cwd: tmp,
    env,
    stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timeout = setTimeout(() => proc.kill(), 10_000);
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]).finally(() => clearTimeout(timeout));
  return { code, stdout, stderr };
}

describe('kortix tools agent verbs', () => {
  let config: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'kortix-tools-verbs-'));
    seen = [];
    config = startServer();
  });
  afterEach(() => {
    server?.stop(true);
    server = null;
    rmSync(tmp, { recursive: true, force: true });
  });

  test('search sends the query as surface cli in the workspace and prints a table', async () => {
    const run = await runCli(['search', 'echo', 'text', '--family', 'connectors', '--limit', '5'], config);
    expect(run.code).toBe(0);
    expect(seen).toEqual([
      { path: '/v1/agent-tools/search', projectId: PROJECT, surface: 'cli', body: { query: 'echo text', family: 'connectors', limit: 5 } },
    ]);
    expect(run.stdout).toContain('connectors.echo.read_echo');
    expect(run.stdout).toContain('text: string');
  });

  test('--json prints the server result unchanged', async () => {
    const run = await runCli(['search', 'echo', '--json'], config);
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout).results[0].id).toBe('connectors.echo.read_echo');
  });

  test('call with --input returns ok and exits 0', async () => {
    const run = await runCli(['call', 'connectors.echo.read_echo', '--input', '{"text":"hi"}'], config);
    expect(run.code).toBe(0);
    expect(seen[0]!.body).toEqual({ id: 'connectors.echo.read_echo', input: { text: 'hi' } });
    expect(JSON.parse(run.stdout)).toEqual({ echo: 'hi' });
  });

  test('call reads its input from stdin', async () => {
    const run = await runCli(['call', 'connectors.echo.read_echo'], config, '{"text":"piped"}');
    expect(run.code).toBe(0);
    expect(seen[0]!.body.input).toEqual({ text: 'piped' });
  });

  test('a held call exits 3 and prints the approval URL and "do not repeat"', async () => {
    const run = await runCli(['call', 'connectors.echo.post_echo', '--input', '{"text":"hi"}'], config);
    expect(run.code).toBe(3);
    expect(run.stderr).toContain('http://web.test/review/call');
    expect(run.stderr).toContain('Do not repeat the call');
    expect(run.stderr).toContain(`kortix tools resume ${EXECUTION}`);
    const json = await runCli(['call', 'connectors.echo.post_echo', '--json'], config);
    expect(json.code).toBe(3);
    expect(JSON.parse(json.stdout).execution_id).toBe(EXECUTION);
  });

  test('a denied call exits 1 with its reason', async () => {
    const run = await runCli(['call', 'connectors.echo.delete_all'], config);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('denied: policy_block');
  });

  test('describe of an unknown id prints suggestions and exits 1', async () => {
    const run = await runCli(['describe', 'connectors.echo.read_echoo'], config);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('connectors.echo.read_echo');
    const ok = await runCli(['describe', 'connectors.echo.read_echo'], config);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('Input schema');
  });

  test('execute runs a program from --file; resume and skills post their bodies', async () => {
    const file = join(tmp, 'program.js');
    writeFileSync(file, 'text("started");\nconst a = 1;\nreturn { sum: a + 2 };\n');
    const run = await runCli(['execute', '--file', file], config);
    expect(run.code).toBe(0);
    expect(seen[0]!.body.code).toContain('return { sum: a + 2 };');
    expect(run.stdout).toContain('started');
    expect(run.stdout).toContain('"sum": 3');

    const resume = await runCli(['resume', EXECUTION], config);
    expect(resume.code).toBe(0);
    expect(resume.stdout).toContain('pending');

    const skill = await runCli(['skills', 'kortix-system', '--file', 'references/cli.md'], config);
    expect(skill.code).toBe(0);
    expect(skill.stdout).toContain('# kortix-system');
    expect(seen.slice(1).map((s) => s.body)).toEqual([
      { execution_id: EXECUTION },
      { name: 'kortix-system', file: 'references/cli.md' },
    ]);
  });

  test('usage errors exit 2 and send nothing', async () => {
    expect((await runCli(['search'], config)).code).toBe(2);
    expect((await runCli(['call', 'connectors.echo.read_echo', '--input', '{bad'], config)).code).toBe(2);
    expect((await runCli(['call', 'connectors.echo.read_echo', '--input', '[1]'], config)).code).toBe(2);
    expect((await runCli(['search', 'x', '--limit', 'many'], config)).code).toBe(2);
    expect((await runCli(['execute'], config)).code).toBe(2);
    expect((await runCli(['describe', 'x', '--bogus'], config)).code).toBe(2);
    expect(seen).toEqual([]);
  });
});
