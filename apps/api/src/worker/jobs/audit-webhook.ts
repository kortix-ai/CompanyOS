import { runWorkerTick } from '../../shared/audit-scope';
import { leaderTimer } from '../../shared/leader-timer';
import { runAuditWebhookDeliveryPass, setAuditWebhookWaker } from '../../shared/audit-webhooks';

const WORKER_IDLE_MS = 2_000;
const WORKER_ERROR_MS = 5_000;

const job = leaderTimer(
  () =>
    runWorkerTick('audit-webhooks', async () => {
      try {
        const claimed = await runAuditWebhookDeliveryPass();
        return claimed > 0 ? 0 : WORKER_IDLE_MS;
      } catch (error) {
        console.warn('[audit-webhook] worker tick failed', error);
        return WORKER_ERROR_MS;
      }
    }),
  { name: 'audit-webhooks' },
);

/** Run the next tick now: a replayed delivery is due. A no-op unless this process runs the worker. */
export function wakeAuditWebhookWorker(): void {
  // A no-op, exactly as before: the old `scheduleWorker(0)` skipped an armed
  // timer, and a run in flight re-arms itself from its own return value — so
  // in every reachable state the wake could not move a due tick earlier. The
  // armed 2 s idle tick picks the replayed delivery up instead.
}

export function startAuditWebhookWorker(): void {
  setAuditWebhookWaker(wakeAuditWebhookWorker);
  job.start();
}

export function stopAuditWebhookWorker(): Promise<void> {
  setAuditWebhookWaker(null);
  return job.stop();
}
