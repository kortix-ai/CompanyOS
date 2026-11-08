import { triggerAppDeploymentWorker } from '../../apps/deployment-worker';
import { leaderTimer } from '../../shared/leader-timer';

let timer: ReturnType<typeof leaderTimer> | null = null;

export function startAppDeploymentWorker(): void {
  if (process.env.KORTIX_APPS_WORKER_ENABLED === 'false') return;
  if (timer) return;
  const interval = Math.max(1_000, Number(process.env.KORTIX_APPS_WORKER_INTERVAL_MS) || 5_000);
  timer = leaderTimer(
    async () => {
      triggerAppDeploymentWorker();
      return interval;
    },
    { name: 'app-deployments' },
  );
  // The first pass runs at once, as the old immediate call did beside the timer.
  timer.start();
}

export async function stopAppDeploymentWorker(): Promise<void> {
  const stopped = timer;
  timer = null;
  await stopped?.stop();
}
