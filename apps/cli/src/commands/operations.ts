/**
 * Every Kortix API operation is a command, by its id: `kortix secrets.set
 * --body '{"name":"K","value":"v"}'`, `kortix sessions.list --limit 5`. The
 * commands come from the operation catalog the SDK carries (`listOperations`),
 * which the API's own routes generate, so a new route is a new command with no
 * CLI change. `kortix ops` finds and describes them.
 *
 * Flags are the operation's parameters, by name (`--sessionId`) or in
 * kebab-case (`--session-id`). `--body` is the JSON body: inline JSON,
 * `@<file>`, or `-` for stdin. The workspace parameter fills from the usual
 * context (`--workspace`, the session box, the checkout link, the default).
 * The answer is printed as JSON. A call a workspace rule holds for a person
 * prints its `pending_approval` answer and exits 3: Kortix runs it once after
 * approval, so a script must not call it again.
 */
import { readFileSync } from 'node:fs';
import { ApiError as SdkApiError, callOperation, listOperations, type OperationDescriptor, type OperationId } from '@kortix/sdk';

import { ApiError } from '../api/client.ts';
import { withKortixScope } from '../api/sdk.ts';
import { emitJson, resolveProjectAuth, resolveProjectContext, surfaceApiError } from '../command-helpers.ts';
import { C, status } from '../style.ts';

/** Exit code of a call held for a person's approval. */
export const EXIT_PENDING_APPROVAL = 3;

const WORKSPACE_PARAMS = new Set(['workspaceId', 'projectId']);
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The operation an argv[0] names, or null. */
export function operationNamed(name: string | undefined): OperationDescriptor | null {
  if (!name || !name.includes('.')) return null;
  return listOperations().find((op) => op.id === name) ?? null;
}

/** `--flag value`, `--flag=value`, and the global flags this command reads. */
export function parseOperationFlags(argv: string[]): { flags: Map<string, string>; error?: string } {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) return { flags, error: `unexpected argument \`${arg}\`: pass parameters as --name value` };
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if (eq !== -1) flags.set(name, arg.slice(eq + 1));
    else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) flags.set(name, argv[++i]!);
    else flags.set(name, 'true');
  }
  return { flags };
}

/** The JSON body of `--body`: inline JSON, `@file`, or `-` for stdin. */
function readBody(value: string): unknown {
  const raw = value === '-' ? readFileSync(0, 'utf8') : value.startsWith('@') ? readFileSync(value.slice(1), 'utf8') : value;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('--body is not JSON (pass JSON, @file or - for stdin)');
  }
}

/** A query value as the API reads it: numbers and booleans as typed, the rest as text. */
const scalar = (value: string): string | number | boolean =>
  value === 'true' ? true : value === 'false' ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;

function describe(op: OperationDescriptor): string {
  const lines = [
    `${C.bold}${op.id}${C.reset}  ${C.dim}${op.method} ${op.path}${C.reset}`,
    op.summary ? `  ${op.summary}` : '',
    `  IAM action: ${op.action}${op.exposure === 'human' ? '  (people only: an agent is refused)' : ''}`,
    '',
    ...op.parameters.map(
      (p) => `  --${kebab(p.name)}  ${C.dim}${p.in}${p.required ? ', required' : ''}${WORKSPACE_PARAMS.has(p.name) ? ', default: the current workspace' : ''}${C.reset}`,
    ),
    ...(op.body ? [`  --body  ${C.dim}JSON, @file or - (stdin)${C.reset}`] : []),
  ];
  return `${lines.filter((l, i) => l !== '' || i === 3).join('\n')}\n`;
}

/** `kortix ops [words…]`, `kortix ops describe <id>`. */
export async function runOps(argv: string[]): Promise<number> {
  if (argv[0] === 'describe') {
    const op = operationNamed(argv[1]);
    if (!op) {
      process.stderr.write(`${status.err(`No operation \`${argv[1] ?? ''}\`.`)} Run ${C.cyan}kortix ops <words>${C.reset} to find one.\n`);
      return 2;
    }
    if (argv.includes('--json')) emitJson(op);
    else process.stdout.write(describe(op));
    return 0;
  }
  const json = argv.includes('--json');
  const words = argv.filter((a) => !a.startsWith('--')).map((w) => w.toLowerCase());
  const ops = listOperations().filter((op) => {
    const text = `${op.id} ${op.summary ?? ''} ${op.path}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  if (json) {
    emitJson(ops);
    return 0;
  }
  for (const op of ops) process.stdout.write(`${op.id.padEnd(44)} ${C.dim}${op.summary ?? `${op.method} ${op.path}`}${C.reset}\n`);
  process.stderr.write(`${C.dim}${ops.length} operations. Run one: kortix <id> --param value [--body JSON]. Read one: kortix ops describe <id>.${C.reset}\n`);
  return 0;
}

/** `kortix <operation id> [--param value…] [--body JSON]`. */
export async function runOperation(op: OperationDescriptor, argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(describe(op));
    return 0;
  }
  const parsed = parseOperationFlags(argv);
  if (parsed.error) {
    process.stderr.write(`${status.err(parsed.error)}\n`);
    return 2;
  }
  const flags = parsed.flags;
  const hostArg = flags.get('host');
  const workspaceArg = flags.get('workspace') ?? flags.get('project');
  const args: Record<string, unknown> = {};
  try {
    for (const p of op.parameters) {
      const value = flags.get(p.name) ?? flags.get(kebab(p.name));
      if (value !== undefined) args[p.name] = p.in === 'query' ? scalar(value) : value;
    }
    if (op.body && flags.has('body')) args.body = readBody(flags.get('body')!);
  } catch (err) {
    process.stderr.write(`${status.err((err as Error).message)}\n`);
    return 2;
  }
  const known = new Set(['host', 'workspace', 'project', 'body', 'json', ...op.parameters.flatMap((p) => [p.name, kebab(p.name)])]);
  const unknown = [...flags.keys()].filter((k) => !known.has(k));
  if (unknown.length) {
    process.stderr.write(`${status.err(`${op.id} takes no --${unknown[0]}.`)} Run ${C.cyan}kortix ops describe ${op.id}${C.reset}.\n`);
    return 2;
  }

  const workspaceParam = op.parameters.find((p) => WORKSPACE_PARAMS.has(p.name) && p.in === 'path');
  let auth;
  if (workspaceParam && args[workspaceParam.name] === undefined) {
    const ctx = await resolveProjectContext({ projectArg: workspaceArg, hostArg });
    if (!ctx) return 1;
    args[workspaceParam.name] = ctx.projectId;
    auth = ctx.auth;
  } else {
    auth = resolveProjectAuth({ hostArg }).auth;
    if (!auth?.token) {
      process.stderr.write(`${status.err('Not logged in. Run `kortix login`.')}\n`);
      return 1;
    }
  }

  try {
    const answer = await withKortixScope(auth, () => callOperation(op.id as OperationId, args));
    emitJson(answer);
    if ((answer as { status?: unknown } | null)?.status === 'pending_approval') {
      process.stderr.write(`${C.dim}Held for a person's approval. Kortix runs it once after approval: do not run it again.${C.reset}\n`);
      return EXIT_PENDING_APPROVAL;
    }
    return 0;
  } catch (err) {
    if (err instanceof SdkApiError && !(err instanceof ApiError)) {
      return surfaceApiError(new ApiError(err.status ?? 0, err.message, err.details ?? err.data ?? null));
    }
    return surfaceApiError(err);
  }
}
