/**
 * Integration test (real PostgreSQL): a merged change request's notice to its
 * origin session never waits for a trigger into another session (KRTX-5211).
 *
 * A trigger into another session can start a sandbox, so its fire is held here
 * at the `fireGitTrigger` boundary until the test releases it. Every query and
 * every other fire is real. Proves: the origin hears of the merge while the
 * other fire is still held; a trigger into the origin, pinned or a reused or
 * keyed session that is the origin, still fires before the notice and stays
 * the one prompt there.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { accountMembers, projectSessions, projects, sessionLifecycleCommands } from '@kortix/db';
import { eq } from 'drizzle-orm';
import { extractTriggers, parseManifestString } from '../projects/triggers';
import { reconcileProjectTriggerRuntime } from '../projects/trigger-runtime-catalog';
import { newRuntimeTriggerId, parseRuntimeTriggerBody, runtimeTriggerSpec } from '../projects/lib/runtime-triggers';
import { insertSessionReminder } from '../projects/lib/session-reminders';
import { setNoticeBatchHoldForTests } from '../projects/session-notice-batch';
import { db } from '../shared/db';
import { insertIntoView } from './helpers/compat-views';
import { removeSeeded, seedProject, seedSession, type SeededProject } from './helpers/integration-fixtures';

const realTriggerFire = await import('../projects/lib/trigger-fire');
const realFireGitTrigger = realTriggerFire.fireGitTrigger;
const held = new Map<string, Promise<void>>();
mock.module('../projects/lib/trigger-fire', () => ({
  ...realTriggerFire,
  fireGitTrigger: async (input: Parameters<typeof realFireGitTrigger>[0]) => {
    await held.get(input.spec.slug);
    return realFireGitTrigger(input);
  },
}));
const { fireChangeRequestMergedTriggers } = await import('../projects/lib/change-request-triggers');

const OWNER = crypto.randomUUID();
let seeded: SeededProject;

/** A one-time `change_request` trigger into `sessionId`, held until the returned release runs. */
async function heldTrigger(sessionId: string, crId: string, hold: boolean): Promise<{ slug: string; release: () => void }> {
  const now = new Date();
  const parsed = parseRuntimeTriggerBody({ prompt: 'merged', source: { type: 'change_request', cr_id: crId }, target: { session_id: sessionId } }, now);
  if ('error' in parsed) throw new Error(parsed.error);
  const spec = runtimeTriggerSpec({ id: newRuntimeTriggerId(), body: parsed, agent: 'kortix', now });
  if ('error' in spec) throw new Error(spec.error);
  await insertSessionReminder({ projectId: seeded.project_id, spec, createdBy: OWNER, firstFireAt: null, now });
  let release = () => {};
  if (hold) held.set(spec.slug, new Promise<void>((resolve) => { release = resolve; }));
  return { slug: spec.slug, release };
}

/** A kortix.yaml `change_request` trigger on `base` whose earlier fire made `sessionId` its session. */
async function declaredTriggerOwning(sessionId: string, base: string, mode: string[]): Promise<void> {
  const slug = `merged-${base}`;
  const manifest = parseManifestString(
    ['triggers:', `  - slug: ${slug}`, '    type: change_request', `    filter: { base: ${base} }`, '    agent: kortix', ...mode.map((line) => `    ${line}`), '    prompt: merged'].join('\n'),
  );
  const { specs, errors } = extractTriggers(manifest);
  if (errors.length > 0) throw new Error(JSON.stringify(errors));
  await reconcileProjectTriggerRuntime(seeded.project_id, specs);
  await db.update(projectSessions).set({ metadata: { trigger_slug: slug, trigger_kind: 'git', trigger_session_key: 'feature' } }).where(eq(projectSessions.sessionId, sessionId));
}

async function projectRow() {
  const [row] = await db.select().from(projects).where(eq(projects.projectId, seeded.project_id));
  return row!;
}

async function sourcesOf(sessionId: string): Promise<string[]> {
  const rows = await db.select().from(sessionLifecycleCommands).where(eq(sessionLifecycleCommands.sessionId, sessionId));
  return rows.map((row) => row.source);
}

/** The commands `sessionId` holds once it holds `count`, or after 5 s. */
async function awaitSources(sessionId: string, count: number): Promise<string[]> {
  for (let waited = 0; waited < 5_000; waited += 100) {
    const sources = await sourcesOf(sessionId);
    if (sources.length >= count) return sources;
    await Bun.sleep(100);
  }
  return sourcesOf(sessionId);
}

beforeAll(async () => {
  // A merge notice stays queued for the assertions: no delivery kick during the test.
  setNoticeBatchHoldForTests(60_000);
  seeded = await seedProject('cr-merge-notice-order', { metadata: { experimental: { reminders: true } } });
  await insertIntoView(db, accountMembers, { accountId: seeded.account_id, userId: OWNER, accountRole: 'owner' });
});

afterAll(async () => {
  await db.delete(projectSessions).where(eq(projectSessions.projectId, seeded.project_id));
  await removeSeeded([seeded]);
});

describe('merge notice order', () => {
  test('the origin hears of its merge while a trigger into another session is still firing', async () => {
    const origin = await seedSession(seeded, OWNER);
    const other = await seedSession(seeded, OWNER);
    const cr = { cr_id: crypto.randomUUID(), number: 21, title: 'Ship it', base_ref: 'dev' };
    const slow = await heldTrigger(other, cr.cr_id, true);

    const firing = fireChangeRequestMergedTriggers(await projectRow(), [cr], origin);

    expect(await awaitSources(origin, 1)).toEqual(['system:cr-merged']);
    expect(await sourcesOf(other)).toEqual([]);
    slow.release();
    expect(await firing).toBe(1);
    expect(await sourcesOf(other)).toEqual(['trigger:reminder']);
  });

  test('a trigger into the origin fires before the notice and stays its one prompt, with another trigger held', async () => {
    const origin = await seedSession(seeded, OWNER);
    const other = await seedSession(seeded, OWNER);
    const cr = { cr_id: crypto.randomUUID(), number: 22, title: 'Fix it', base_ref: 'dev' };
    const slow = await heldTrigger(other, cr.cr_id, true);
    await heldTrigger(origin, cr.cr_id, false);

    const firing = fireChangeRequestMergedTriggers(await projectRow(), [cr], origin);

    expect(await awaitSources(origin, 1)).toEqual(['trigger:reminder']);
    slow.release();
    expect(await firing).toBe(2);
    expect(await sourcesOf(origin)).toEqual(['trigger:reminder']);
    expect(await sourcesOf(other)).toEqual(['trigger:reminder']);
  });

  for (const [mode, base] of [[['session_mode: reuse'], 'reuse'], [['session_key: "{{ change_request.head_ref }}"'], 'keyed']] as const) {
    test(`a ${base} trigger whose session is the origin fires before the notice and stays its one prompt`, async () => {
      const origin = await seedSession(seeded, OWNER);
      const other = await seedSession(seeded, OWNER);
      const cr = { cr_id: crypto.randomUUID(), number: 23, title: 'Reuse it', base_ref: base, head_ref: 'feature' };
      await declaredTriggerOwning(origin, base, [...mode]);
      const slow = await heldTrigger(other, cr.cr_id, true);

      const firing = fireChangeRequestMergedTriggers(await projectRow(), [cr], origin);

      expect(await awaitSources(origin, 1)).toEqual(['trigger:change_request']);
      slow.release();
      expect(await firing).toBe(2);
      expect(await sourcesOf(origin)).toEqual(['trigger:change_request']);
      expect(await sourcesOf(other)).toEqual(['trigger:reminder']);
    });
  }
});
