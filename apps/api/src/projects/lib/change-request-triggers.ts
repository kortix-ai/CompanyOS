/**
 * The `change_request` source (`lib/runtime-triggers.ts`): a merged change
 * request fires every enabled trigger whose filter matches it, runtime rows and
 * kortix.yaml `type: change_request` entries alike (both are
 * `project_trigger_runtime` rows: reconcile catalogs the manifest ones). The
 * merge route calls this after the merge is durable; it never fails the merge.
 *
 * The session that opened the merged request hears of the merge once, armed
 * or not (KRTX-5211): a platform notice, unless a trigger already queued this
 * merge into that session.
 */
import { projectSessions, projectTriggerRuntime, sessionLifecycleCommands } from '@kortix/db';
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import { db } from '../../shared/db';
import { recordTriggerRun, triggerRunFromFire } from '../trigger-execution-store';
import type { GitTriggerSpec } from '../triggers';
import { type MergedChangeRequest, changeRequestMatches } from './runtime-triggers';
import type { ProjectRow } from './serializers';
import { raiseTriggerAlert } from './trigger-alerts';
import { fireGitTrigger, markGitTriggerAttemptFailed, markGitTriggerFired } from './trigger-fire';
import { renderTriggerInput } from './trigger-payload';
import { automaticFirePauseReason } from './trigger-scheduler-state';
import { errorMessage } from '../../shared/error-message';
import { enqueueSessionNotice } from '../session-notice-batch';

/**
 * Fire the triggers each merged request matches, then tell `originSessionId`
 * (the session that opened `merged[0]`) that its request merged. Returns the
 * fires that reached a session. Never throws.
 */
export async function fireChangeRequestMergedTriggers(
  project: ProjectRow,
  merged: readonly MergedChangeRequest[],
  originSessionId: string | null = null,
): Promise<number> {
  try {
    if (merged.length === 0) return 0;
    const rows = await db
      .select({ slug: projectTriggerRuntime.slug, spec: projectTriggerRuntime.scheduleSpec })
      .from(projectTriggerRuntime)
      .where(
        and(
          eq(projectTriggerRuntime.projectId, project.projectId),
          eq(projectTriggerRuntime.triggerType, 'change_request'),
          eq(projectTriggerRuntime.enabled, true),
          isNull(projectTriggerRuntime.autoPausedAt),
        ),
      );
    let reached = 0;
    if (rows.length > 0) {
      const paused = await automaticFirePauseReason(project);
      for (const cr of merged) {
        for (const row of rows) {
          const spec = row.spec as unknown as GitTriggerSpec;
          if (!spec || !changeRequestMatches(spec, cr)) continue;
          if (await fireOne(project, spec, cr, paused)) reached += 1;
        }
      }
    }
    if (originSessionId) {
      await notifyOriginSession(project, merged[0], originSessionId).catch((error: unknown) =>
        logger.warn('[cr-merge] origin session notice failed', { projectId: project.projectId, error: errorMessage(error) }),
      );
    }
    return reached;
  } catch (error) {
    logger.warn('[triggers] change request fire failed', {
      projectId: project.projectId,
      error: errorMessage(error),
    });
    return 0;
  }
}

async function fireOne(project: ProjectRow, spec: GitTriggerSpec, cr: MergedChangeRequest, paused: string | null): Promise<boolean> {
  const now = new Date();
  const payload = {
    change_request: cr,
    // A kortix.yaml slug has no `.`; a runtime id does (`trigger.<hex>`).
    trigger: { slug: spec.slug, type: spec.type, kind: spec.slug.includes('.') ? 'runtime' : 'declared' },
    fired_at: now.toISOString(),
  };
  const run = { projectId: project.projectId, slug: spec.slug, source: 'change_request' as const, spec, payload, now };
  // A paused project or account records the merge as a skipped run, like a paused webhook.
  if (paused) {
    await recordTriggerRun({ ...run, status: 'skipped', error: paused });
    return false;
  }
  const result = await fireGitTrigger({
    spec,
    project,
    payload,
    renderedPrompt: renderTriggerInput(spec, payload),
    source: 'change_request',
    // One merge fires one trigger once, however often the hook is retried.
    idempotencyKey: triggerFireKey(project.projectId, spec.slug, cr.cr_id),
  }).catch((error: unknown) => ({ status: 'failed' as const, error: errorMessage(error) }));
  await recordTriggerRun({ ...run, ...triggerRunFromFire(result) });
  if (result.status === 'fired' || result.status === 'queued') {
    if (!('deduped' in result && result.deduped)) {
      await markGitTriggerFired(project.projectId, spec.slug, new Date(), 'fired', { endsAlert: result.status === 'fired' });
    }
    return true;
  }
  if (result.status === 'failed') {
    const error = result.error ?? 'trigger fire failed';
    await markGitTriggerAttemptFailed(project.projectId, spec.slug, new Date(), error).catch(() => {});
    await raiseTriggerAlert({ projectId: project.projectId, accountId: project.accountId, slug: spec.slug, source: 'fire', error });
  }
  return false;
}

function triggerFireKey(projectId: string, slug: string, crId: string): string {
  return `trigger:change_request:${projectId}:${slug}:${crId}`;
}

/**
 * The merge as a platform notice into the session that opened the request: it
 * wakes an idle session and steers a running turn. A loop or a pinned trigger
 * that already queued this merge into the session is the one notice.
 */
async function notifyOriginSession(project: ProjectRow, cr: MergedChangeRequest, sessionId: string): Promise<void> {
  const [session] = await db
    .select({ createdBy: projectSessions.createdBy })
    .from(projectSessions)
    .where(and(
      eq(projectSessions.sessionId, sessionId),
      eq(projectSessions.projectId, project.projectId),
      sql`coalesce(${projectSessions.metadata}->>'deletedAt', '') = ''`,
    ))
    .limit(1);
  if (!session) return;
  const [armed] = await db
    .select({ commandId: sessionLifecycleCommands.commandId })
    .from(sessionLifecycleCommands)
    .where(and(
      eq(sessionLifecycleCommands.sessionId, sessionId),
      like(sessionLifecycleCommands.idempotencyKey, triggerFireKey(project.projectId, '%', cr.cr_id)),
    ))
    .limit(1);
  if (armed) return;
  const title = cr.title ? ` "${cr.title}"` : '';
  // No title or branch closes the element early: the transcript draws its body as the notice line.
  const line = `CR #${cr.number}${title} was merged into ${cr.base_ref}.`.replace(/[<>]/g, '');
  await enqueueSessionNotice({
    source: 'system:cr-merged',
    projectId: project.projectId,
    accountId: project.accountId,
    sessionId,
    actorUserId: session.createdBy,
    text: `<kortix_system type="cr-merged" source="kortix-change-requests">${line}</kortix_system>\nThis message is from the platform, not from the user.`,
    // One merge, one notice, however often the hook is retried.
    key: `cr-merged:${cr.cr_id}`,
  });
}
