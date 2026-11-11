// The agent tools as code: the six verbs every agent surface serves
// (`skills`, `search`, `describe`, `call`, `execute`, `resume`), over
// `POST /v1/agent-tools/{verb}`. One search finds a tool among everything the
// caller can reach (project connectors, the Kortix API, sessions, sandboxes),
// `describe` shows its schema, `call` runs it with the caller's own authority.
//
//   const tools = kortix.project(projectId).agentTools();
//   const { results } = await tools.search({ query: 'send a slack message' });
//   const result = await tools.call(results[0].id, { channel: '#ops', text: 'hi' });
//   if (result.status === 'pending_approval') console.log(result.approval_url);
//
// A tool that ran and reported a failure answers HTTP 422 with the same JSON
// shape: that is a result (`status: 'denied' | 'error'`, a describe miss with
// `suggestions`, an `execute` with `ok: false`), never a thrown error. Invalid
// input (400), a refused token (401) and a 422 without the verb's shape throw
// an `ApiError`.

import { ApiError } from '../../http/api/errors';
import { backendApi } from '../../http/api-client';

/** The request header that names the surface a call came from. */
export const AGENT_TOOLS_SURFACE_HEADER = 'x-kortix-surface';

/** The surface a client reports. Call logs and approval items show it. */
export type AgentToolSurface = 'api' | 'cli' | 'app';

/** What a tool does to the world. `null` when the source does not say. */
export type AgentToolRisk = 'read' | 'write' | 'destructive';

export interface AgentToolsClientOptions {
  /** The project the tools act in. Without it, the server uses the caller's only project. */
  projectId?: string;
  /** Default `api`. A CLI sends `cli`, a Kortix app `app`. */
  surface?: AgentToolSurface;
  /** Per-request timeout. Default 60 s (`execute` runs for up to 50 s). */
  timeoutMs?: number;
}

export interface AgentToolSkillsInput {
  /** A skill name; omit it to list the skills. */
  name?: string;
  /** A reference file the skill names, e.g. `references/cli.md`. */
  file?: string;
}

/** The skill list, or one skill, as Markdown. */
export interface AgentToolSkillsResult {
  text: string;
}

export interface AgentToolSearchInput {
  /** What you want to do, e.g. `send a slack message`. */
  query: string;
  /** An id prefix: `connectors`, `kortix`, `sessions`, `sandbox`, `projects`, `connector_admin`. */
  family?: string;
  /** Default 10, max 50. */
  limit?: number;
}

/** One search hit: enough to choose and call a tool, never its full schema. */
export interface AgentToolSearchHit {
  /** The handle `describe` and `call` take: `connectors.<slug>.<action>`, `kortix.<METHOD> <path>`, … */
  id: string;
  title: string;
  risk: AgentToolRisk | null;
  description: string;
  /** Compact input signature: `channel: string, text: string, thread_ts?: string`. */
  input: string;
}

export interface AgentToolSearchResult {
  results: AgentToolSearchHit[];
  /** True when the page was cut by its byte budget or the limit. */
  truncated: boolean;
  /** The next step, in one sentence. */
  next: string;
}

/** The full contract of one tool. */
export interface AgentToolDescription {
  id: string;
  title: string;
  description: string;
  risk: AgentToolRisk | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
}

/** `describe` of an id that does not exist: the closest ids. */
export interface AgentToolNotFound {
  error: string;
  suggestions: string[];
}

export type AgentToolDescribeResult = AgentToolDescription | AgentToolNotFound;

/**
 * The call ran. A `data` too big for one answer arrives as `data_truncated`,
 * `data_chars`, `data_preview` and a `note` instead of `data`.
 */
export interface AgentToolCallOk {
  status: 'ok';
  data?: unknown;
  data_truncated?: true;
  data_chars?: number;
  data_preview?: string;
  note?: string;
}

/** The call waits for a person's approval. Never repeat it: `resume` reads its outcome. */
export interface AgentToolCallPending {
  status: 'pending_approval';
  execution_id: string | null;
  /** The page a person opens to approve or deny. */
  approval_url: string | null;
  /** True when Kortix runs the call itself after approval. */
  runs_on_approval: boolean;
  next: string;
}

/** The call did not run (`denied`) or ran and failed (`error`). */
export interface AgentToolCallFailure {
  status: 'denied' | 'error';
  /** The machine reason, e.g. `policy_block`, `connector_not_connected`. */
  reason: string;
  message: string;
  data?: unknown;
}

export type AgentToolCallResult = AgentToolCallOk | AgentToolCallPending | AgentToolCallFailure;

/** A call inside an `execute` program that waits for approval. */
export interface AgentToolPendingApproval {
  id: string;
  execution_id: string | null;
  approval_url: string | null;
}

/** The result of one `execute` program. */
export interface AgentToolExecuteResult {
  ok: boolean;
  /** The program's return value (when `ok`). */
  value?: unknown;
  /** Why the program failed (when not `ok`). */
  error?: { kind: string; message: string };
  /** What the program wrote with `text(...)`. */
  output?: string;
  /** Tool calls the program made. */
  calls: number;
  pending_approvals?: AgentToolPendingApproval[];
  next?: string;
}

/** The state of a held call. `resume` only reads; it never approves. */
export interface AgentToolResumeResult {
  execution_id: string;
  /** `pending` while a person has not decided; otherwise the review item's status. */
  state: string | null;
  action: string | null;
  decision: string | null;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  outcome: unknown;
  expires_at: string | null;
  next: string;
}

/** The six agent-tool verbs, bound to one project and one surface. */
export interface AgentToolsClient {
  /** List the Kortix skills (and the project's own), or read one. */
  skills(input?: AgentToolSkillsInput): Promise<AgentToolSkillsResult>;
  /** Find tools by intent across everything the caller can reach. */
  search(input: AgentToolSearchInput): Promise<AgentToolSearchResult>;
  /** The full input and output schema of one tool id. */
  describe(id: string): Promise<AgentToolDescribeResult>;
  /** Run one tool with the caller's authority. */
  call(id: string, input?: Record<string, unknown>): Promise<AgentToolCallResult>;
  /** Run a JavaScript program (an async function body) that calls `search`, `describe`, `call` and `skills`. */
  execute(code: string): Promise<AgentToolExecuteResult>;
  /** Read the state of a call that waits for approval. */
  resume(executionId: string): Promise<AgentToolResumeResult>;
}

const DEFAULT_TIMEOUT_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A 422 body that is the verb's own result shape. */
const RESULT_ON_422: Record<string, (body: Record<string, unknown>) => boolean> = {
  call: (body) => body.status === 'denied' || body.status === 'error',
  describe: (body) => typeof body.error === 'string' && Array.isArray(body.suggestions),
  execute: (body) => body.ok === false,
};

function failureMessage(error: ApiError): string {
  const body = error.details;
  if (isRecord(body)) {
    if (typeof body.text === 'string') return body.text;
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
  }
  return error.message;
}

/** The agent-tool verbs over `POST /v1/agent-tools/{verb}`. */
export function createAgentToolsClient(options: AgentToolsClientOptions = {}): AgentToolsClient {
  const surface = options.surface ?? 'api';
  const query = options.projectId ? `?project_id=${encodeURIComponent(options.projectId)}` : '';

  async function post<T>(verb: string, body: Record<string, unknown>): Promise<T> {
    const response = await backendApi.post<T>(`/agent-tools/${verb}${query}`, body, {
      headers: { [AGENT_TOOLS_SURFACE_HEADER]: surface },
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      showErrors: false,
    });
    if (response.success && response.data !== undefined) return response.data;
    const error = response.error;
    if (error instanceof ApiError && error.status === 422) {
      const details = error.details;
      if (isRecord(details) && RESULT_ON_422[verb]?.(details)) return details as T;
      throw new ApiError(failureMessage(error), { status: 422, details, code: 'tool_error' });
    }
    throw error ?? new ApiError(`agent-tools ${verb} failed`, {});
  }

  return {
    skills: (input = {}) => {
      const body: Record<string, unknown> = {};
      if (input.name) body.name = input.name;
      if (input.file) body.file = input.file;
      return post<AgentToolSkillsResult>('skills', body);
    },
    search: (input) => {
      const body: Record<string, unknown> = { query: input.query };
      if (input.family) body.family = input.family;
      if (input.limit !== undefined) body.limit = input.limit;
      return post<AgentToolSearchResult>('search', body);
    },
    describe: (id) => post<AgentToolDescribeResult>('describe', { id }),
    call: (id, input = {}) => post<AgentToolCallResult>('call', { id, input }),
    execute: (code) => post<AgentToolExecuteResult>('execute', { code }),
    resume: (executionId) => post<AgentToolResumeResult>('resume', { execution_id: executionId }),
  };
}
