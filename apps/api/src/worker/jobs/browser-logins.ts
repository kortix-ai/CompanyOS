import { sweepBrowserLogins } from "../../auth/browser-logins/service";
import { runWorkerTick } from "../../shared/audit-scope";
import { logger } from "../../lib/logger";
import { leaderTimer } from "../../shared/leader-timer";
const timer = leaderTimer(async () => {
  try {
    await runWorkerTick("browser-logins", sweepBrowserLogins);
  } catch {
    logger.error("[browser-logins] retention unavailable");
  }
  return 60_000;
});
export const startBrowserLogins = timer.start;
export const stopBrowserLogins = timer.stop;
