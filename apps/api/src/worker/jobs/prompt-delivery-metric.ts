import { config } from '../../config';
import { logger } from '../../lib/logger';
import { countUnreachablePrompts, unreachablePromptsMetricLine } from '../../projects/surface';
import { runWorkerTick } from '../../shared/audit-scope';
import { leaderTimer } from '../../shared/leader-timer';

const TICK_MS = 60_000;

// Once a minute the lease holder writes one `{"kortix_metric":"prompt_delivery",…}`
// line to stdout: the running boxes holding a prompt Kortix could not deliver.
// A CloudWatch log metric filter turns it into `Kortix/Sessions`
// `UnreachableActiveBoxes`, and an alarm pages when it stays high
// (infra/terraform/modules/ecs-api). Why only `active` boxes count:
// projects/session-lifecycle/unreachable-prompts.ts.
const reporter = leaderTimer(async () => {
  try {
    await runWorkerTick('prompt-delivery-metric', async () => {
      const counts = await countUnreachablePrompts();
      process.stdout.write(`${unreachablePromptsMetricLine(counts, config.INTERNAL_KORTIX_ENV)}\n`);
    });
  } catch (err) {
    logger.error('[prompt-delivery-metric] tick failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return TICK_MS;
});

export const startPromptDeliveryMetric = reporter.start;
export const stopPromptDeliveryMetric = reporter.stop;
