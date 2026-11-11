/**
 * `kortix tools search|describe|call|execute|resume|skills`: the six agent
 * tools every Kortix agent surface serves, over `POST /v1/agent-tools/{verb}`
 * through `@kortix/sdk` (`kortix.project(id).agentTools({ surface: 'cli' })`).
 *
 * One search finds a tool among everything the caller can reach: the
 * workspace's connectors (`connectors.<slug>.<action>`), the Kortix API
 * (`kortix.<METHOD> <path>`), sessions, sandboxes and connector setup.
 *
 * Exit codes: 0 ok; 1 denied, error, or an unknown id; 2 usage; 3 the call
 * waits for a person's approval (the approval URL is printed; never repeat it).
 */
import { readFileSync } from 'node:fs';
import type {
  AgentToolCallResult,
  AgentToolDescribeResult,
  AgentToolExecuteResult,
  AgentToolResumeResult,
  AgentToolSearchResult,
  AgentToolsClient,
} from '@kortix/sdk';
import { kortixFromAuth, withKortixScope } from '../api/sdk.ts';
import { emitJson, fail, missing, resolveProjectContext, surfaceApiError, takeFlagBool, takeFlagValue } from '../command-helpers.ts';
import { C, pad, status } from '../style.ts';

export const AGENT_TOOL_VERBS = ['search', 'describe', 'call', 'execute', 'resume', 'skills'] as const;
export type AgentToolVerb = (typeof AGENT_TOOL_VERBS)[number];

export const isAgentToolVerb = (value: string | undefined): value is AgentToolVerb =>
  (AGENT_TOOL_VERBS as readonly string[]).includes(value ?? '');

/** Exit code of a call that waits for a person's approval. */
export const EXIT_PENDING_APPROVAL = 3;

export const AGENT_TOOLS_HELP = `Agent tools (the same six tools every Kortix agent gets):
  search <query> [--family <f>] [--limit <n>]
                            Find tools by intent: connectors.<slug>.<action>,
                            kortix.<METHOD> <path>, sessions.*, sandbox.*,
                            projects.*, connector_admin.*.
  describe <id>             The full input and output schema of one tool id.
                            An unknown id prints the closest ids (exit 1).
  call <id> [--input <json> | --input-file <path> | stdin]
                            Run one tool as you. Exit 0 ok, 1 denied/error,
                            3 waits for a person's approval: the approval URL
                            is printed. Never repeat a held call.
  execute [--file <path> | stdin]
                            Run a JavaScript program (an async function body)
                            that calls search(), describe(), call(), skills().
  resume <execution_id>     Read the state of a held call. It never approves.
  skills [name] [--file <path>]
                            List the Kortix skills, or read one (or one of its
                            reference files).
  Quote an id that has spaces: kortix tools describe 'kortix.GET /v1/projects'.
  --json prints the server's JSON result unchanged (the exit codes stay).
`;

interface AgentToolsArgs {
  verb: AgentToolVerb;
  positional: string[];
  json: boolean;
  projectArg?: string;
  hostArg?: string;
  family?: string;
  limit?: string;
  input?: string;
  inputFile?: string;
  file?: string;
}

async function readStdinText(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const stdinIsPiped = () => !process.stdin.isTTY;

/** Parse the flags of one verb, or print a usage error and return 2. */
function parseArgs(verb: AgentToolVerb, argv: string[]): AgentToolsArgs | number {
  const rest = [...argv];
  const args: AgentToolsArgs = { verb, positional: [], json: takeFlagBool(rest, ['--json']) };
  try {
    args.projectArg = takeFlagValue(rest, ['--project', '--workspace']);
    args.hostArg = takeFlagValue(rest, ['--host']);
    if (verb === 'search') {
      args.family = takeFlagValue(rest, ['--family']);
      args.limit = takeFlagValue(rest, ['--limit']);
    }
    if (verb === 'call') {
      args.input = takeFlagValue(rest, ['--input']);
      args.inputFile = takeFlagValue(rest, ['--input-file']);
    }
    if (verb === 'execute' || verb === 'skills') args.file = takeFlagValue(rest, ['--file']);
  } catch (err) {
    return fail((err as Error).message);
  }
  const unknown = rest.find((arg) => arg.startsWith('-') && arg !== '-');
  if (unknown) return fail(`unknown option "${unknown}" for kortix tools ${verb}. Run kortix tools --help.`);
  args.positional = rest;
  return args;
}

/** The `call` input: --input, --input-file (`-` is stdin), piped stdin, or `{}`. */
async function callInput(args: AgentToolsArgs): Promise<Record<string, unknown> | number> {
  if (args.input !== undefined && args.inputFile !== undefined) return fail('Pass --input or --input-file, not both.');
  let raw: string | undefined = args.input;
  let source = '--input';
  if (args.inputFile !== undefined) {
    source = args.inputFile === '-' ? 'stdin' : args.inputFile;
    try {
      raw = args.inputFile === '-' ? await readStdinText() : readFileSync(args.inputFile, 'utf8');
    } catch (err) {
      return fail(`cannot read ${args.inputFile}: ${(err as Error).message}`);
    }
  } else if (raw === undefined && stdinIsPiped()) {
    source = 'stdin';
    raw = await readStdinText();
  }
  if (raw === undefined || !raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fail(`${source} is not JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(`${source} must be a JSON object.`);
  return parsed as Record<string, unknown>;
}

/** The `execute` program: --file (`-` is stdin), a positional `-`, or piped stdin. */
async function programSource(args: AgentToolsArgs): Promise<string | number> {
  const file = args.file ?? (args.positional[0] === '-' ? '-' : undefined);
  if (args.positional.length > (args.positional[0] === '-' ? 1 : 0)) {
    return fail('execute takes the program from --file <path> or stdin, not as an argument.');
  }
  let code: string;
  try {
    if (file && file !== '-') code = readFileSync(file, 'utf8');
    else if (file === '-' || stdinIsPiped()) code = await readStdinText();
    else return missing('the program: --file <path>, or pipe it on stdin');
  } catch (err) {
    return fail(`cannot read ${file}: ${(err as Error).message}`);
  }
  if (!code.trim()) return fail('The program is empty.');
  return code;
}

// ── Rendering ───────────────────────────────────────────────────────────────

function printSearch(page: AgentToolSearchResult): number {
  if (page.results.length === 0) {
    process.stdout.write(`${C.dim}No tools match. ${page.next}${C.reset}\n`);
    return 0;
  }
  const idWidth = Math.min(60, Math.max(2, ...page.results.map((hit) => hit.id.length))) + 2;
  process.stdout.write(`${C.dim}${pad('ID', idWidth)}${pad('RISK', 13)}INPUT${C.reset}\n`);
  for (const hit of page.results) {
    process.stdout.write(`${pad(hit.id, idWidth)}${pad(hit.risk ?? '-', 13)}${hit.input || '-'}\n`);
    if (hit.description) process.stdout.write(`${' '.repeat(idWidth)}${C.dim}${hit.description}${C.reset}\n`);
  }
  if (page.truncated) process.stdout.write(`${C.dim}More results exist: narrow the query, or pass --family or --limit.${C.reset}\n`);
  process.stdout.write(`${C.dim}${page.next}${C.reset}\n`);
  return 0;
}

function printSuggestions(error: string, suggestions: string[]): number {
  process.stderr.write(`${status.err(error)}\n`);
  if (suggestions.length) {
    process.stderr.write(`  ${C.dim}Did you mean:${C.reset}\n${suggestions.map((s) => `    ${s}`).join('\n')}\n`);
  }
  return 1;
}

function printDescribe(found: AgentToolDescribeResult): number {
  if ('suggestions' in found) return printSuggestions(found.error, found.suggestions);
  process.stdout.write(`${C.bold}${found.id}${C.reset}  ${C.dim}${found.risk ?? '-'}${C.reset}\n`);
  process.stdout.write(`${found.title}\n`);
  if (found.description) process.stdout.write(`\n${found.description}\n`);
  process.stdout.write(`\n${C.dim}Input schema:${C.reset}\n${JSON.stringify(found.input_schema ?? {}, null, 2)}\n`);
  if (found.output_schema) process.stdout.write(`\n${C.dim}Output schema:${C.reset}\n${JSON.stringify(found.output_schema, null, 2)}\n`);
  return 0;
}

function printPending(executionId: string | null, approvalUrl: string | null, next?: string): void {
  process.stderr.write(`${status.warn('The call waits for a person\'s approval. Do not repeat the call.')}\n`);
  if (approvalUrl) process.stderr.write(`  ${C.dim}Approve it here:${C.reset} ${C.cyan}${approvalUrl}${C.reset}\n`);
  if (executionId) process.stderr.write(`  ${C.dim}Read the outcome:${C.reset} ${C.cyan}kortix tools resume ${executionId}${C.reset}\n`);
  if (next) process.stderr.write(`  ${C.dim}${next}${C.reset}\n`);
}

function callExit(result: AgentToolCallResult): number {
  if (result.status === 'ok') return 0;
  if (result.status === 'pending_approval') return EXIT_PENDING_APPROVAL;
  return 1;
}

function printCall(result: AgentToolCallResult): number {
  if (result.status === 'ok') {
    if (result.data_truncated) {
      process.stderr.write(`${status.warn(result.note ?? `The result is ${result.data_chars} characters; only a preview is shown.`)}\n`);
      process.stdout.write(`${result.data_preview ?? ''}\n`);
    } else {
      process.stdout.write(`${typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? null, null, 2)}\n`);
    }
    return 0;
  }
  if (result.status === 'pending_approval') {
    printPending(result.execution_id, result.approval_url, result.next);
    return EXIT_PENDING_APPROVAL;
  }
  process.stderr.write(`${status.err(`${result.status}: ${result.reason}`)}\n  ${result.message}\n`);
  if (result.data !== undefined && result.data !== null) process.stderr.write(`${JSON.stringify(result.data, null, 2)}\n`);
  return 1;
}

function executeExit(result: AgentToolExecuteResult): number {
  if (!result.ok) return 1;
  return result.pending_approvals?.length ? EXIT_PENDING_APPROVAL : 0;
}

function printExecute(result: AgentToolExecuteResult): number {
  if (result.output) process.stdout.write(`${result.output}\n`);
  if (!result.ok) {
    process.stderr.write(`${status.err(`${result.error?.kind ?? 'error'}: ${result.error?.message ?? 'the program failed'}`)}\n`);
  } else if ('value' in result && result.value !== undefined) {
    process.stdout.write(`${typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2)}\n`);
  }
  process.stderr.write(`${C.dim}${result.calls} tool call${result.calls === 1 ? '' : 's'}.${C.reset}\n`);
  for (const held of result.pending_approvals ?? []) {
    process.stderr.write(`  ${C.dim}${held.id}:${C.reset}\n`);
    printPending(held.execution_id, held.approval_url);
  }
  return executeExit(result);
}

function printResume(state: AgentToolResumeResult): number {
  const rows: Array<[string, unknown]> = [
    ['execution', state.execution_id],
    ['state', state.state],
    ['action', state.action],
    ['decision', state.decision],
    ['decided by', state.decided_by],
    ['decided at', state.decided_at],
    ['note', state.note],
    ['expires at', state.expires_at],
  ];
  for (const [label, value] of rows) {
    if (value !== null && value !== undefined) process.stdout.write(`${C.dim}${pad(label, 12)}${C.reset}${String(value)}\n`);
  }
  if (state.outcome !== null && state.outcome !== undefined) {
    process.stdout.write(`${C.dim}outcome${C.reset}\n${JSON.stringify(state.outcome, null, 2)}\n`);
  }
  process.stdout.write(`${C.dim}${state.next}${C.reset}\n`);
  return 0;
}

// ── Dispatch ────────────────────────────────────────────────────────────────

async function runVerb(tools: AgentToolsClient, args: AgentToolsArgs): Promise<number> {
  const [first] = args.positional;
  switch (args.verb) {
    case 'search': {
      const query = args.positional.join(' ').trim();
      if (!query) return missing('a query: kortix tools search "<what you want to do>"');
      let limit: number | undefined;
      if (args.limit !== undefined) {
        limit = Number(args.limit);
        if (!Number.isInteger(limit) || limit < 1) return fail('--limit must be a positive integer.');
      }
      const page = await tools.search({ query, family: args.family, limit });
      return args.json ? (emitJson(page), 0) : printSearch(page);
    }
    case 'describe': {
      if (!first || args.positional.length > 1) return missing('one tool id (quote an id that has spaces)');
      const found = await tools.describe(first);
      if (args.json) return (emitJson(found), 'suggestions' in found ? 1 : 0);
      return printDescribe(found);
    }
    case 'call': {
      if (!first || args.positional.length > 1) return missing('one tool id (quote an id that has spaces)');
      const input = await callInput(args);
      if (typeof input === 'number') return input;
      const result = await tools.call(first, input);
      if (args.json) {
        emitJson(result);
        if (result.status === 'pending_approval') printPending(result.execution_id, result.approval_url);
        return callExit(result);
      }
      return printCall(result);
    }
    case 'execute': {
      const code = await programSource(args);
      if (typeof code === 'number') return code;
      const result = await tools.execute(code);
      return args.json ? (emitJson(result), executeExit(result)) : printExecute(result);
    }
    case 'resume': {
      if (!first || args.positional.length > 1) return missing('the execution_id of a held call');
      const state = await tools.resume(first);
      return args.json ? (emitJson(state), 0) : printResume(state);
    }
    case 'skills': {
      if (args.positional.length > 1) return fail('skills takes at most one skill name.');
      if (args.file && !first) return missing('the skill name that --file belongs to');
      const result = await tools.skills({ name: first, file: args.file });
      if (args.json) return (emitJson(result), 0);
      process.stdout.write(result.text.endsWith('\n') ? result.text : `${result.text}\n`);
      return 0;
    }
  }
}

/** `kortix tools <verb> …` for the six agent-tool verbs. */
export async function runAgentToolVerb(verb: AgentToolVerb, argv: string[]): Promise<number> {
  const args = parseArgs(verb, argv);
  if (typeof args === 'number') return args;
  const ctx = await resolveProjectContext({ projectArg: args.projectArg, hostArg: args.hostArg });
  if (!ctx) return 1;
  const tools = kortixFromAuth(ctx.auth).project(ctx.projectId).agentTools({ surface: 'cli' });
  try {
    return await withKortixScope(ctx.auth, () => runVerb(tools, args));
  } catch (err) {
    return surfaceApiError(err);
  }
}
