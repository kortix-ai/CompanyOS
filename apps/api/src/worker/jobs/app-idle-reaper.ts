import { runAppIdleReaper, runAppKeepAlive } from '../../apps/idle-reaper';
import { logger } from '../../lib/logger';
import { runWorkerTick } from '../../shared/audit-scope';
import { leaderTimer } from '../../shared/leader-timer';

let timer: ReturnType<typeof leaderTimer> | null = null;

export function startAppIdleReaper(): void {
  if (process.env.KORTIX_APPS_IDLE_REAPER_ENABLED === 'false') return;
  if (timer) return;
  const interval = Math.max(5_000, Number(process.env.KORTIX_APPS_IDLE_REAPER_INTERVAL_MS) || 30_000);
  timer = leaderTimer(
    async () => {
      await Promise.all([
        runWorkerTick('app-idle-reaper', runAppIdleReaper).catch((error) => logger.error('[apps] idle reaper failed', {
          error: error instanceof Error ? error.message : String(error),
        })),
        // Its own guard and its own 5-minute cadence: a slow always-on start never
        // holds up an idle stop.
        runWorkerTick('app-keep-alive', () => runAppKeepAlive()).catch((error) => logger.error('[apps] keep-alive pass failed', {
          error: error instanceof Error ? error.message : String(error),
        })),
      ]);
      return interval;
    },
    { firstDelayMs: interval, name: 'app-idle-reaper' },
  );
  timer.start();
}

export async function stopAppIdleReaper(): Promise<void> {
  const reaper = timer;
  timer = null;
  await reaper?.stop();
}
