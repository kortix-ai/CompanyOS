// Expired shared Idempotency-Key answers (KRTX-4612): one leader-only chain deletes them.

import { sweepExpiredReplays } from '../../llm-gateway/idempotency-replays';
import { runWorkerTick } from '../../shared/audit-scope';
import { leaderTimer } from '../../shared/leader-timer';

const TICK_MS = 10 * 60_000;

const sweeper = leaderTimer(async () => {
  try {
    const gone = await runWorkerTick('gateway-replay-sweep', () => sweepExpiredReplays());
    if (gone) console.info('[gateway replay sweep] deleted', gone);
  } catch (err) {
    console.error('[gateway replay sweep] tick failed', err);
  }
  return TICK_MS;
});

export const startReplaySweeper = sweeper.start;
export const stopReplaySweeper = sweeper.stop;
