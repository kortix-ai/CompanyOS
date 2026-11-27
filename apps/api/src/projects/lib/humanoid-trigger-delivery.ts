/**
 * The humanoid dispatcher's delivery for trigger fires (flag `humanoid`): a
 * cron, webhook, connector or monitor fire that `fireGitTrigger` wrote to the
 * event log is replayed here, as the original fire, into its target.
 */
import { eq } from 'drizzle-orm';
import { registerHumanoidDelivery } from '../../humanoid/dispatch';
import { db } from '../../shared/db';
import { projectsView } from '../../workspaces/rows';
import { fireGitTrigger } from './trigger-fire';
import type { TriggerFireSource } from './trigger-webhook-auth';

type LoggedFire = {
  fire_source?: TriggerFireSource;
  fire?: {
    spec: Parameters<typeof fireGitTrigger>[0]['spec'];
    payload: Record<string, unknown>;
    renderedPrompt: string;
    idempotencyKey: string | null;
  };
};

for (const source of ['schedule', 'webhook', 'connector'] as const) {
  registerHumanoidDelivery(source, async (row) => {
    const logged = row.payload as LoggedFire;
    if (!logged.fire || !logged.fire_source) throw new Error('humanoid trigger event has no fire to replay');
    const [project] = await db.select().from(projectsView).where(eq(projectsView.projectId, row.projectId)).limit(1);
    if (!project) throw new Error('the workspace of this trigger is gone');
    const result = await fireGitTrigger({
      spec: logged.fire.spec,
      project,
      payload: logged.fire.payload,
      renderedPrompt: logged.fire.renderedPrompt,
      source: logged.fire_source,
      idempotencyKey: logged.fire.idempotencyKey,
      fromHumanoidLog: true,
    });
    if (result.status === 'failed') throw new Error(result.error ?? result.reason ?? 'the trigger fire failed');
    return { sessionId: result.sessionId ?? null };
  });
}
