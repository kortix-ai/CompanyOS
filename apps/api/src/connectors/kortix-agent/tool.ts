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
  /** Replace the account's data and write it to the credential. */
  save(data: D): Promise<void>;
  /** The clock, in ms. */
  now(): number;
}

export interface AgentTool<D = Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  run(args: Record<string, unknown>, ctx: AgentToolContext<D>): Promise<unknown>;
}
