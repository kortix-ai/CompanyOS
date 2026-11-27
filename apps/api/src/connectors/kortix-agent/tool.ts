/**
 * One tool of a Kortix agent-identity MCP server. The schema helpers and the
 * argument readers are the Google servers' (../google/tool.ts).
 */
import type { ToolAnnotations } from '../google/tool';
import type { AccountState } from './state';

export { DESTRUCTIVE, READ, WRITE, ToolInputError, optInt, optStr, reqStr, s, i, schema } from '../google/tool';

export interface AgentToolContext<D> {
  /** The account's state, decrypted from its credential. */
  state: AccountState<D>;
  /**
   * Change the account's data atomically: `mutate` gets the CURRENT stored
   * data (another session may have changed it) and returns the new data.
   * Returns what was written; `state` then holds it too.
   */
  update(mutate: (data: D) => D): Promise<D>;
  /** The clock, in ms. */
  now(): number;
  /** The calling session (set by the gateway), or null for a call outside a session. */
  sessionId: string | null;
}

export interface AgentTool<D = Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  run(args: Record<string, unknown>, ctx: AgentToolContext<D>): Promise<unknown>;
}
