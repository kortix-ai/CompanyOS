/**
 * Prompts parked on the runtime-unreachable ladder, counted for the fleet alarm.
 *
 * A prompt parks (`parkPromptForUnreachableRuntime`, `result.delivery_blocked =
 * 'runtime_unreachable'`) for two reasons the row does not tell apart
 * (`deliver.ts`, `SendOutcome`):
 *
 *  1. The path to the box is down: the proxy answered 502/503/504 or the POST
 *     timed out. The box itself is running, so its `session_sandboxes` row
 *     stays `active`.
 *  2. The box is hibernated or parked (stage `stopped` or `failed`). Ordinary
 *     use does this every time a prompt reaches a sleeping box.
 *
 * `activeBoxes` counts only case 1: distinct boxes Kortix records as `active`
 * that hold a parked prompt. On 2026-11-11 the Platinum edge on 2 of 6 hosts
 * answered nothing for 17 min; 33 of 90 running boxes were unreachable while
 * Platinum still reported them running, and no alert fired. `parkedPrompts`
 * counts every parked row, for the dashboard.
 *
 * Both counts read queued rows only. A delivered or dead-lettered row leaves
 * `queued`, and a parked row dead-letters after 3 attempts (about 10.5 min),
 * so the counts describe the last ~10 minutes, never history.
 */
import { sessionLifecycleCommands, sessionSandboxes } from '@kortix/db';
import { sql } from 'drizzle-orm';
import { db } from '../../shared/db';
import { RUNTIME_UNREACHABLE_REASON } from './command-transitions';

export interface UnreachablePromptCounts {
  /** Queued prompts parked `runtime_unreachable`, on any box. */
  parkedPrompts: number;
  /** Distinct `active` boxes that hold a parked prompt: running boxes Kortix cannot reach. */
  activeBoxes: number;
}

export async function countUnreachablePrompts(): Promise<UnreachablePromptCounts> {
  // `idx_session_lifecycle_commands_due (status, available_at)` serves the
  // `status = 'queued'` filter; the box is one unique-index lookup per row.
  const [row] = await db.execute<{ parked_prompts: number; active_boxes: number }>(sql`
    SELECT count(*)::int AS parked_prompts,
           count(DISTINCT box.sandbox_id) FILTER (WHERE box.status = 'active')::int AS active_boxes
      FROM ${sessionLifecycleCommands} AS cmd
      LEFT JOIN ${sessionSandboxes} AS box ON box.session_id = cmd.session_id
     WHERE cmd.status = 'queued'
       AND cmd.command_type = 'continue_session'
       AND cmd.result->>'delivery_blocked' = ${RUNTIME_UNREACHABLE_REASON}`);
  return {
    parkedPrompts: Number(row?.parked_prompts ?? 0),
    activeBoxes: Number(row?.active_boxes ?? 0),
  };
}

/**
 * The once-a-minute JSON line a CloudWatch log metric filter reads
 * (`infra/terraform/modules/ecs-api`, `Kortix/Sessions`
 * `UnreachableActiveBoxes`). Same shape as the worker heartbeat's
 * `{"kortix_metric":"worker_jobs",…}` line.
 */
export function unreachablePromptsMetricLine(counts: UnreachablePromptCounts, environment: string): string {
  return JSON.stringify({
    kortix_metric: 'prompt_delivery',
    environment,
    unreachable_active_boxes: counts.activeBoxes,
    parked_prompts: counts.parkedPrompts,
  });
}
