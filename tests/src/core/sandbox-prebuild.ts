/**
 * The sandbox pre-build's session create (tests/src/core/runner.ts).
 *
 * Bounded retry on the API's own typed PRE-COMMIT degradations (marked
 * `ke2eRetryable` by `.status()` — the git mirror's cold-clone
 * `git_mirror_unavailable` and a `retry: true` 5xx), and on a marked
 * client-side rejection from the request itself.
 *
 * NOT a flow, so no flow-level budget exists to honor the mark: without this
 * retry one transient mirror blip red-gated the whole release
 * (run 42666114535 attempt 3: 503 GitOperationError at 17:54:38, thirty
 * seconds after the provision returned 201).
 *
 * Re-sending is safe: both degradations happen before the session row is
 * written, and the session id is per-attempt generated — a stray committed
 * row at worst, never a duplicate-key failure. The edge-laundered route
 * stays as-is: that branch raises its own mark and this loop's re-send of a
 * completed POST would duplicate the resource.
 */
import type { Client, Res } from './client';
import { isKe2eRetryableError, ke2eRetryDelayMs } from './client';
import { log } from './log';
import { sleep } from './poll';

export const SANDBOX_PREBUILD_CREATE_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 15_000;

export async function postSessionWithRetry(
  client: Client,
  project: { id: string },
): Promise<Res> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await client.post('/v1/projects/:projectId/sessions', {},
        { params: { projectId: project.id } });
      return response.status(201);
    } catch (error) {
      const nextAttempt = attempt + 1;
      if (
        !isKe2eRetryableError(error) ||
        nextAttempt > SANDBOX_PREBUILD_CREATE_ATTEMPTS
      ) {
        throw error;
      }
      const delayMs = Math.min(ke2eRetryDelayMs(error), MAX_RETRY_DELAY_MS);
      log.warn(
        `sandbox pre-build create retryable; ` +
          `re-sending (attempt ${nextAttempt}/${SANDBOX_PREBUILD_CREATE_ATTEMPTS}) in ${delayMs} ms`,
      );
      await sleep(delayMs);
    }
  }
}
