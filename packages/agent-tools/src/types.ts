/** A JSON Schema document. Rendered for agents; the source validates input. */
export type JsonSchema = Record<string, unknown>;

/** What a tool does to the world. Drives approval defaults and read-only scopes. */
export type ToolRisk = 'read' | 'write' | 'destructive';

/**
 * One tool in the namespace.
 *
 * `id` is the only handle an agent needs: `search` returns it, `describe` and
 * `call` take it. Families:
 * - `connectors.<slug>.<action>`  an action of a project connector
 * - `kortix.<METHOD> <path>`      a Kortix API operation (`/v1/...`)
 * - `<family>.<name>`             a built-in (`sessions.start`, `sandbox.read_file`, …)
 */
export interface ToolEntry {
  id: string;
  title: string;
  description: string;
  risk: ToolRisk | null;
  inputSchema?: JsonSchema | null;
  outputSchema?: JsonSchema | null;
  /** Words that should match a search but are not in the title or description. */
  keywords?: string[];
}

/** The outcome of one `call`. Every surface returns exactly this shape. */
export type ToolCallOutcome =
  | { status: 'ok'; data: unknown }
  /** Held for a person. `resume({ execution_id })` reads the outcome later. */
  | {
      status: 'pending_approval';
      executionId: string | null;
      approvalUrl: string | null;
      message: string;
      /** True when Kortix runs the call itself after approval: never repeat it. */
      runsOnApproval: boolean;
    }
  | { status: 'denied' | 'error'; reason: string; message: string; data?: unknown };

/**
 * A family of tools. A source lists what the caller may reach and runs a call
 * with the caller's own authority; the core never decides access.
 */
export interface ToolSource {
  /** The id prefix this source owns, including the dot (`connectors.`). */
  readonly prefix: string;
  /** Every tool the caller can reach. May be cached by the source. */
  list(): Promise<ToolEntry[]>;
  /** One tool by id, with full schemas. Defaults to a lookup in `list()`. */
  describe?(id: string): Promise<ToolEntry | null>;
  call(id: string, input: Record<string, unknown>): Promise<ToolCallOutcome>;
}

/** One skill: a document that teaches an agent how to use a part of Kortix. */
export interface SkillSummary {
  name: string;
  description: string;
}

export interface SkillSource {
  list(): Promise<SkillSummary[]>;
  read(name: string): Promise<{ name: string; content: string } | null>;
}
