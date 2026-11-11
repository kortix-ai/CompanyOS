/**
 * The six tools every agent surface serves: `skills`, `search`, `describe`,
 * `call`, `execute`, `resume`. The tool list has the same size whether a
 * project connects 3 tools or 7,000: an agent searches for what it needs.
 *
 * `execute` runs a model-written JavaScript program in a QuickJS sandbox
 * whose only way out is calling `search`, `describe`, `call` and `skills`, so
 * a multi-step task stays out of the model's context and every call inside it
 * goes through the same access, policy, approval and call log as a direct one.
 */
import { CodemodeSandbox } from '@earendil-works/pi-codemode';
import { createToolCore, type ToolCallOutcome, type ToolCore } from '@kortix/agent-tools';
import type { CallSurface } from '@kortix/api-contract/tool-calls';
import { callApi, runTool, text, ToolInputError, type ToolContext, type ToolResult } from './runtime';
import { builtinSources, connectorSource, kortixApiSource, resultOutcome } from './tool-sources';
import { fitData } from './connectors';

/** `execute` limits. Time is also capped by the request budget (the 55 s MCP cut). */
export const EXECUTE_MAX_SOURCE_CHARS = 65_536;
export const EXECUTE_MAX_CALLS = 100;
export const EXECUTE_MAX_MS = 50_000;
const EXECUTE_MEMORY_BYTES = 128 * 1024 * 1024;
/** QuickJS workers one API process runs at once. */
const EXECUTE_MAX_WORKERS = 4;
// replica-local: a per-process admission count for execute workers.
let activeWorkers = 0;

const PROJECT_ID = {
  type: 'string',
  description: 'The project_id (UUID). Optional when the MCP URL names one (?project=) or you can open exactly one project.',
} as const;

export const VERB_TOOLS = [
  {
    name: 'skills',
    title: 'Read Kortix skills',
    description:
      'List the Kortix guides, or read one by name (kortix-system is the full reference). With project_id, also the project\'s own skills. Read a skill before working in an unfamiliar part of Kortix.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name; omit to list them.' },
        file: { type: 'string', description: 'A reference file the skill names, e.g. references/cli.md.' },
        project_id: PROJECT_ID,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'search',
    title: 'Search tools',
    description:
      'Find a tool by intent across everything you can reach: the project\'s connectors (connectors.<slug>.<action>), the Kortix API (kortix.<METHOD> <path>), sessions, sandboxes and connector setup. Returns ids with a one-line input; describe an id for its full schema, then call it.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you want to do, e.g. "send a slack message", "list secrets".' },
        family: { type: 'string', description: 'Optional id prefix: connectors, kortix, sessions, sandbox, projects, connector_admin.' },
        limit: { type: 'number', description: 'Max results (default 10, max 50).' },
        project_id: PROJECT_ID,
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'describe',
    title: 'Describe a tool',
    description: 'Full input and output schema of one tool id from search.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'A tool id from search.' }, project_id: PROJECT_ID },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'call',
    title: 'Call a tool',
    description:
      'Run one tool as you, with your permissions. Connector writes may need a person\'s approval: the result is then pending_approval with an execution_id and an approval_url to give the person. Never ask a person for a password or key in chat: connector_admin.connect returns a link they open.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'A tool id from search.' },
        input: { type: 'object', additionalProperties: true, description: 'The tool input, as describe shows it.' },
        project_id: PROJECT_ID,
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  {
    name: 'execute',
    title: 'Run a program over tools',
    description:
      `Run a JavaScript program (an async function body) that calls tools: await search({query}), describe({id}), call({id, input}), skills({name}). Use it for multi-step work: loops, joins, filtering big results before you read them. call() returns {status, data|reason|message}; status pending_approval means a person must approve. text(value) adds output; return a value. No fetch, timers, files or imports. Limits: ${EXECUTE_MAX_SOURCE_CHARS} characters, ${EXECUTE_MAX_CALLS} tool calls, ${EXECUTE_MAX_MS / 1000} s.`,
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'The program body.' }, project_id: PROJECT_ID },
      required: ['code'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  {
    name: 'resume',
    title: 'Read a held call',
    description:
      'Read the state of a call that waits for a person\'s approval: pending, approved and run (with its result), denied, or expired. It never approves anything.',
    inputSchema: {
      type: 'object',
      properties: { execution_id: { type: 'string', description: 'The execution_id of a pending_approval result.' }, project_id: PROJECT_ID },
      required: ['execution_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
] as const;

const VERB_NAMES = new Set<string>(VERB_TOOLS.map((t) => t.name));
export const isVerb = (name: string) => VERB_NAMES.has(name);

/** The project a call works in: the argument, the URL default, or the caller's only project. */
async function projectFor(ctx: ToolContext, input: Record<string, unknown>, fallback: string | null): Promise<string | null> {
  if (typeof input.project_id === 'string' && input.project_id.trim()) return input.project_id.trim();
  if (fallback) return fallback;
  const r = await callApi(ctx, 'GET', '/v1/projects');
  if (r.status >= 400) return null;
  const rows = JSON.parse(r.body) as Array<{ project_id?: string }>;
  return Array.isArray(rows) && rows.length === 1 ? (rows[0]!.project_id ?? null) : null;
}

export function toolCoreFor(ctx: ToolContext, projectId: string | null, surface: CallSurface): ToolCore {
  const defaults = { projectId };
  return createToolCore({
    sources: [...builtinSources(ctx, defaults), kortixApiSource(ctx, defaults), connectorSource(ctx, projectId, surface)],
  });
}

const json = (value: unknown, isError = false): ToolResult => text(JSON.stringify(value, null, 2), isError);

/**
 * A call's result for a model. A big `data` is replaced by a parseable preview
 * plus a note to narrow the request, never cut mid-JSON (learnings 2026-09-28:
 * a truncated tool result makes models fail or improvise).
 */
function outcomeResult(outcome: ToolCallOutcome): ToolResult {
  if (outcome.status === 'ok') return text(fitData({ status: 'ok' }, 'data', outcome.data));
  if (outcome.status === 'pending_approval') {
    return json({
      status: 'pending_approval',
      execution_id: outcome.executionId,
      approval_url: outcome.approvalUrl,
      runs_on_approval: outcome.runsOnApproval,
      next: outcome.message,
    });
  }
  return text(fitData({ status: outcome.status, reason: outcome.reason, message: outcome.message }, 'data', outcome.data ?? null), true);
}

export async function runVerb(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown>,
  opts: { projectId: string | null; surface: CallSurface },
): Promise<ToolResult> {
  switch (name) {
    case 'skills':
      return runTool(ctx, 'read_skill', input.project_id === undefined && opts.projectId ? { ...input, project_id: opts.projectId } : input);
    case 'search': {
      if (typeof input.query !== 'string' || !input.query.trim()) throw new ToolInputError('query is required');
      const core = toolCoreFor(ctx, await projectFor(ctx, input, opts.projectId), opts.surface);
      return json(await core.search({ query: input.query, limit: typeof input.limit === 'number' ? input.limit : undefined, family: typeof input.family === 'string' ? input.family : undefined }));
    }
    case 'describe': {
      if (typeof input.id !== 'string') throw new ToolInputError('id is required');
      const core = toolCoreFor(ctx, await projectFor(ctx, input, opts.projectId), opts.surface);
      const found = await core.describe(input.id);
      return json(found, 'error' in found);
    }
    case 'call': {
      if (typeof input.id !== 'string') throw new ToolInputError('id is required');
      let callInput = input.input ?? {};
      if (typeof callInput === 'string') callInput = (() => { try { return JSON.parse(callInput as string); } catch { return callInput; } })();
      if (!callInput || typeof callInput !== 'object' || Array.isArray(callInput)) throw new ToolInputError('input must be a JSON object');
      const core = toolCoreFor(ctx, await projectFor(ctx, input, opts.projectId), opts.surface);
      return outcomeResult(await core.call(input.id, callInput as Record<string, unknown>));
    }
    case 'execute':
      return executeProgram(ctx, input, opts);
    case 'resume':
      return resumeCall(ctx, input, opts);
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { rpcCode: -32602 });
  }
}

async function executeProgram(
  ctx: ToolContext,
  input: Record<string, unknown>,
  opts: { projectId: string | null; surface: CallSurface },
): Promise<ToolResult> {
  const code = input.code;
  if (typeof code !== 'string' || !code.trim()) throw new ToolInputError('code is required');
  if (code.length > EXECUTE_MAX_SOURCE_CHARS) throw new ToolInputError(`code is ${code.length} characters; the limit is ${EXECUTE_MAX_SOURCE_CHARS}`);
  const remaining = ctx.deadline - Date.now() - 3_000;
  if (remaining < 2_000) throw new ToolInputError('no time left in this request to run a program');
  const projectId = await projectFor(ctx, input, opts.projectId);
  const core = toolCoreFor(ctx, projectId, 'execute');
  let calls = 0;
  const pending: Array<{ execution_id: string | null; approval_url: string | null; id: string }> = [];
  const counted = <T>(fn: () => Promise<T>) => {
    calls += 1;
    if (calls > EXECUTE_MAX_CALLS) throw new Error(`tool call limit reached (${EXECUTE_MAX_CALLS} per program)`);
    return fn();
  };
  const sandbox = new CodemodeSandbox({
    timeoutMs: Math.min(EXECUTE_MAX_MS, remaining),
    memoryLimitBytes: EXECUTE_MEMORY_BYTES,
    acquireWorker: () => {
      if (activeWorkers >= EXECUTE_MAX_WORKERS) throw new Error('Kortix is running too many programs right now; retry in a few seconds.');
      activeWorkers += 1;
      let released = false;
      return () => {
        if (!released) activeWorkers -= 1;
        released = true;
      };
    },
    // Top-level functions in the program (`await call({...})`), as the tool description promises.
    globals: [
      {
        name: 'search',
        description: 'search({query, family?, limit?}) → {results:[{id,title,risk,description,input}]}',
        execute: (args) => counted(() => core.search(asRecord(args) as { query: string })),
      },
      {
        name: 'describe',
        description: 'describe({id}) → full input/output schema',
        execute: (args) => counted(() => core.describe(String(asRecord(args).id ?? ''))),
      },
      {
        name: 'call',
        description: 'call({id, input}) → {status, data} | {status, reason, message} | {status: "pending_approval", executionId, approvalUrl}',
        execute: (args) =>
          counted(async () => {
            const a = asRecord(args);
            const id = String(a.id ?? '');
            const outcome = await core.call(id, asRecord(a.input));
            if (outcome.status === 'pending_approval') pending.push({ id, execution_id: outcome.executionId, approval_url: outcome.approvalUrl });
            return outcome;
          }),
      },
      {
        name: 'skills',
        description: 'skills({name?}) → the skill list, or one skill',
        execute: (args) => counted(async () => resultOutcome(await runTool(ctx, 'read_skill', { ...asRecord(args), ...(projectId ? { project_id: projectId } : {}) }))),
      },
    ],
  });
  try {
    const result = await sandbox.execute(code);
    const output = result.output.map((o) => (o.type === 'text' ? o.text : `[${o.mimeType} image]`)).join('\n');
    const summary = {
      ok: result.ok,
      ...(result.ok ? { value: result.value } : { error: { kind: result.error.kind, message: result.error.message } }),
      ...(output ? { output } : {}),
      calls,
      ...(pending.length
        ? { pending_approvals: pending, next: 'A person approves each pending call at its approval_url. resume({execution_id}) reads its outcome. Do not repeat the calls.' }
        : {}),
    };
    const { value, ...head } = summary as Record<string, unknown>;
    return text(result.ok ? fitData(head, 'value', value) : JSON.stringify(summary, null, 2), !result.ok);
  } finally {
    await sandbox.close();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function resumeCall(ctx: ToolContext, input: Record<string, unknown>, opts: { projectId: string | null }): Promise<ToolResult> {
  const executionId = typeof input.execution_id === 'string' ? input.execution_id.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(executionId)) throw new ToolInputError('execution_id must be the UUID a pending_approval result carried');
  const projectId = await projectFor(ctx, input, opts.projectId);
  if (!projectId) throw new ToolInputError('project_id is required');
  const r = await callApi(ctx, 'GET', `/v1/projects/${projectId}/review/items/call:${executionId}`);
  if (r.status >= 400) return text(`HTTP ${r.status}\n${r.body}`, true);
  const item = (JSON.parse(r.body)?.review_item ?? {}) as Record<string, any>;
  const detail = (item.detail ?? {}) as Record<string, unknown>;
  const pending = item.status === 'needs_you';
  return json({
    execution_id: executionId,
    state: pending ? 'pending' : (item.status ?? null),
    action: detail.action_path ?? null,
    decision: detail.decision ?? null,
    decided_by: item.acted_by ?? detail.decided_by ?? null,
    decided_at: item.acted_at ?? null,
    note: detail.decision_note ?? item.feedback ?? null,
    outcome: detail.outcome ?? null,
    expires_at: item.expires_at ?? null,
    next: pending
      ? 'Still waiting for a person. Do not repeat the call; read it again later.'
      : 'Decided. Do not repeat the call; if it was approved and Kortix did not run it, call it once more with the same input.',
  });
}
