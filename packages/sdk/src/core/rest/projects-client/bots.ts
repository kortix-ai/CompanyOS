// Bots — `/v1/workspaces/:id/bots` (apps/api/src/projects/routes/bots.ts).
// A bot is an agent of the workspace a person can message (every kortix.yaml
// agent except `mode: subagent` ones, and My Kortix when the workspace runs
// it). Its chat is the caller's DM space with the agent: open it with
// `getOrCreateWorkspaceDm`. The route answers 403 `feature_disabled` while the
// workspace's `kortix_bot` flag is off.

import { backendApi } from '../../http/api-client';
import { unwrap } from './shared';

/** A bot the caller can message. Same fields as the API's `Bot`. */
export interface WorkspaceBot {
  /** The agent name in kortix.yaml. */
  name: string;
  /** The name a person reads: My Kortix for the built-in agent, else the agent name. */
  display_name: string;
  /** The agent's model (`provider/model`), or null for the workspace default. */
  model: string | null;
  /** `active`: it answers. `paused`: messages reach it, but no schedule or event starts it. `off`: kortix.yaml disables it or its block has an error. */
  status: 'active' | 'paused' | 'off';
  /** The workspace's `default_agent`. */
  is_default: boolean;
  /** My Kortix, the built-in agent. */
  builtin: boolean;
  /** The caller's chat with the bot (their DM space), or null before they first open it. */
  chat_space_id: string | null;
}

/**
 * The bots the caller can message, My Kortix first when the workspace runs it,
 * then kortix.yaml order. Rejects with 403 `feature_disabled` while
 * `kortix_bot` is off; the caller decides what to show, so the error never
 * reaches the host error handler.
 */
export async function listWorkspaceBots(workspaceId: string): Promise<WorkspaceBot[]> {
  const res = unwrap(await backendApi.get<{ bots: WorkspaceBot[] }>(`/workspaces/${workspaceId}/bots`, { showErrors: false }));
  return res.bots;
}

/** The bot after a pause or resume, and how many of its running tasks the pause stopped (0 on resume). */
export interface WorkspaceBotPauseResult {
  bot: WorkspaceBot;
  stopped_sessions: number;
}

/**
 * Pause or resume a bot. A paused bot still gets messages, but no schedule,
 * webhook, event or monitor starts it; a person firing a trigger by hand still
 * runs it. Pausing also stops every running task of the bot, for every person.
 * Needs the trigger-update permission (else 403).
 */
export async function setWorkspaceBotPaused(workspaceId: string, name: string, paused: boolean): Promise<WorkspaceBotPauseResult> {
  return unwrap(
    await backendApi.post<WorkspaceBotPauseResult>(`/workspaces/${workspaceId}/bots/${encodeURIComponent(name)}/pause`, { paused }, { showErrors: false }),
  );
}
