/**
 * Integration test (real local DB): My Kortix reads sessions with its person's
 * standing, for sessions no person owns.
 *
 * My Kortix acts with exactly its person's rights, but its token is bound to
 * its own session, and the session read rules drop a bound token's manager and
 * oversight standing. A My Kortix session listed a cron run its person (an
 * admin) can open, then got "not found" when it read it. The read routes now
 * give the standing back (`personRead`, `my-kortix-person.ts`):
 *
 *   - a trigger run, through the person's manager standing;
 *   - any session no person owns, through the person's account oversight;
 *   - never a private session another member started;
 *   - never on a route that changes the session, never lifecycle rights;
 *   - never for a governed agent, a turned-off My Kortix, or a turn another
 *     member (or nobody) prompted.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { accountMembers, accounts, auditEvents, projectSessions, projects, serviceAccounts, type AgentGrant } from '@kortix/db';
import { and, eq, sql } from 'drizzle-orm';

import type { Actor } from '../iam/actor';
import { tokenCredential } from '../iam/actor';
import { clearAuthorizeCaches } from '../iam/authorize';
import { invalidateSessionOversight } from '../iam/session-oversight';
import { loadProjectSessionInventory } from '../projects/lib/session-list';
import { loadVisibleSession } from '../projects/lib/session-visibility';
import type { ProjectRow } from '../projects/lib/serializers';
import { recordTriggerRun } from '../projects/trigger-execution-store';
import { listVisibleTriggerRuns } from '../projects/trigger-runs';
import { createAccountToken } from '../repositories/account-tokens';
import { db } from '../shared/db';
import { insertIntoView } from './helpers/compat-views';
import { removeSeeded, seedProject, type SeededProject } from './helpers/integration-fixtures';

const ADMIN = crypto.randomUUID(); // account admin: manager standing, oversight when the account allows it
const MEMBER = crypto.randomUUID(); // account member: no manager standing
const OTHER = crypto.randomUUID(); // account member who starts a private chat
const users = [ADMIN, MEMBER, OTHER];
const ENGINEERING_SA = crypto.randomUUID(); // the engineering agent's service account
const MY_KORTIX_SA = crypto.randomUUID();
const GOVERNED_SA = crypto.randomUUID();

const ids = {
  run: crypto.randomUUID(), // a cron run of the engineering agent
  agentPrivate: crypto.randomUUID(), // a private session an agent key started (not a trigger run)
  memberChat: crypto.randomUUID(), // another member's private chat
  backendRun: crypto.randomUUID(), // a cron run on a backend (KaaB) origin
  adminMyKortix: crypto.randomUUID(),
  memberMyKortix: crypto.randomUUID(),
  adminGoverned: crypto.randomUUID(), // an engineering session the admin started
};
const TRIGGER_META = { source: 'trigger:cron', trigger_kind: 'git', trigger_slug: 'intake' };
const MY_KORTIX_GRANT: AgentGrant = { agent: 'mykortix', permissions: 'all', connectors: 'all', env: 'all' };
const MY_KORTIX_OFF: AgentGrant = { agent: 'mykortix', permissions: [], connectors: [], env: [] };

let project: SeededProject;
let projectRow: ProjectRow;

/** A real session token, classified by the same `tokenCredential` the auth middleware uses. */
async function sessionActor(input: {
  userId: string;
  sessionId: string;
  serviceAccountId: string;
  grant: AgentGrant;
  onBehalfOf: string | null;
}): Promise<Actor> {
  const token = await createAccountToken({
    accountId: project.account_id,
    userId: input.userId,
    projectId: project.project_id,
    sessionId: input.sessionId,
    name: `Session ${input.sessionId.slice(0, 8)}`,
    agentGrant: input.grant,
    serviceAccountId: input.serviceAccountId,
    onBehalfOfUserId: input.onBehalfOf,
  });
  const credential = await tokenCredential(token.tokenId, project.account_id, input.sessionId);
  if (credential.kind !== 'agent_session') throw new Error(`expected an agent_session credential, got ${credential.kind}`);
  return {
    userId: input.userId,
    accountId: project.account_id,
    credential: { ...credential, onBehalfOfUserId: input.onBehalfOf },
    ctx: {},
  } as Actor;
}

const myKortix = (userId: string, sessionId: string, opts: { grant?: AgentGrant; onBehalfOf?: string | null } = {}) =>
  sessionActor({
    userId,
    sessionId,
    serviceAccountId: MY_KORTIX_SA,
    grant: opts.grant ?? MY_KORTIX_GRANT,
    onBehalfOf: opts.onBehalfOf === undefined ? userId : opts.onBehalfOf,
  });

const human = (userId: string): Actor =>
  ({ userId, accountId: project.account_id, credential: { kind: 'jwt' }, ctx: {} }) as Actor;

/** A read route (`personRead`), as `GET …/sessions/:id` and `GET …/log` call it. */
const read = (actor: Actor, target: string, personRead = true) => {
  const bound = actor.credential.kind === 'agent_session' ? actor.credential.sessionId : null;
  return loadVisibleSession({ row: projectRow, userId: actor.userId, actor }, target, bound, bound, {
    spawnAncestorRead: true,
    triggerReaderRead: true,
    personRead,
  });
};

async function setOversight(enabled: boolean) {
  await db.update(accounts).set({ adminsSeeAllSessions: enabled }).where(eq(accounts.accountId, project.account_id));
  invalidateSessionOversight();
  clearAuthorizeCaches();
}

beforeAll(async () => {
  project = await seedProject('my-kortix-session-read');
  [projectRow] = (await db.select().from(projects).where(eq(projects.projectId, project.project_id))) as ProjectRow[];
  const user = (id: string) =>
    sql`(${id}::uuid, ${`mkread-${id.slice(0, 8)}@example.test`}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`;
  await db.execute(sql`INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES ${sql.join(users.map(user), sql`, `)}`);
  await insertIntoView(db, accountMembers, [
    { userId: ADMIN, accountId: project.account_id, accountRole: 'admin' },
    { userId: MEMBER, accountId: project.account_id, accountRole: 'member' },
    { userId: OTHER, accountId: project.account_id, accountRole: 'member' },
  ]);
  const sa = (serviceAccountId: string, agentName: string) => ({
    serviceAccountId,
    accountId: project.account_id,
    projectId: project.project_id,
    agentName,
    name: agentName,
    secretHash: `h_${serviceAccountId}`,
    publicPrefix: `kortix_sa_${serviceAccountId.slice(0, 6)}`,
  });
  await db.insert(serviceAccounts).values([sa(ENGINEERING_SA, 'engineering'), sa(MY_KORTIX_SA, 'mykortix'), sa(GOVERNED_SA, 'engineering-gov')]);
  const base = { accountId: project.account_id, projectId: project.project_id, visibility: 'private' as const };
  await db.insert(projectSessions).values([
    { ...base, sessionId: ids.run, branchName: ids.run, createdBy: ENGINEERING_SA, origin: 'schedule', agentName: 'engineering', metadata: TRIGGER_META },
    { ...base, sessionId: ids.agentPrivate, branchName: ids.agentPrivate, createdBy: ENGINEERING_SA, origin: 'user', agentName: 'engineering', metadata: { source: 'api' } },
    { ...base, sessionId: ids.memberChat, branchName: ids.memberChat, createdBy: OTHER, origin: 'user', agentName: 'mykortix', metadata: { source: 'ui' } },
    { ...base, sessionId: ids.backendRun, branchName: ids.backendRun, createdBy: ENGINEERING_SA, origin: 'backend', agentName: 'engineering', metadata: TRIGGER_META },
    { ...base, sessionId: ids.adminMyKortix, branchName: ids.adminMyKortix, createdBy: ADMIN, origin: 'user', agentName: 'mykortix', metadata: { source: 'ui' } },
    { ...base, sessionId: ids.memberMyKortix, branchName: ids.memberMyKortix, createdBy: MEMBER, origin: 'user', agentName: 'mykortix', metadata: { source: 'ui' } },
    { ...base, sessionId: ids.adminGoverned, branchName: ids.adminGoverned, createdBy: ADMIN, origin: 'user', agentName: 'engineering', metadata: { source: 'ui' } },
  ]);
  await setOversight(false);
}, 30_000);

afterAll(async () => {
  if (!project) return;
  await removeSeeded([project]);
  await db.execute(sql`DELETE FROM auth.users WHERE id IN (${sql.join(users.map((id) => sql`${id}::uuid`), sql`, `)})`);
});

describe('My Kortix reads a trigger run with its person`s standing', () => {
  test('the admin reads the private cron run in the dashboard (the standing My Kortix borrows)', async () => {
    expect((await read(human(ADMIN), ids.run))?.row.sessionId).toBe(ids.run);
  });

  test('the admin`s My Kortix reads it too: a read, not ownership, not lifecycle', async () => {
    const access = await read(await myKortix(ADMIN, ids.adminMyKortix), ids.run);
    expect(access?.row.sessionId).toBe(ids.run);
    expect(access?.isOwner).toBe(false);
    expect(access?.canManageProject).toBe(false);
    expect(access?.canManageLifecycle).toBe(false);
  });

  test('a route that changes the session (no personRead) still refuses it', async () => {
    expect(await read(await myKortix(ADMIN, ids.adminMyKortix), ids.run, false)).toBeNull();
  });

  test('`kortix triggers runs` lists the run for the admin`s My Kortix', async () => {
    const runId = await recordTriggerRun({ projectId: project.project_id, slug: 'intake', source: 'manual', spec: {}, payload: {}, status: 'succeeded', sessionId: ids.run, now: new Date() });
    if (!runId) throw new Error('Run persistence failed');
    const actor = await myKortix(ADMIN, ids.adminMyKortix);
    const runs = await listVisibleTriggerRuns({ loaded: { row: projectRow, userId: ADMIN, actor }, binding: ids.adminMyKortix, slug: 'intake', limit: 20, cursor: null });
    expect(runs.runs.map((run) => run.run_id)).toContain(runId);
  });

  test('a backend-origin run stays closed: the sibling gate is not lifted', async () => {
    expect(await read(await myKortix(ADMIN, ids.adminMyKortix), ids.backendRun)).toBeNull();
  });

  test('a member without manager standing gets nothing, as in the dashboard', async () => {
    expect(await read(human(MEMBER), ids.run)).toBeNull();
    expect(await read(await myKortix(MEMBER, ids.memberMyKortix), ids.run)).toBeNull();
  });
});

describe('the credential must be My Kortix acting for its person', () => {
  test('a turn nobody prompted (on_behalf_of cleared) reads nothing extra', async () => {
    expect(await read(await myKortix(ADMIN, ids.adminMyKortix, { onBehalfOf: null }), ids.run)).toBeNull();
  });

  test('a turn another member prompted reads nothing extra', async () => {
    expect(await read(await myKortix(ADMIN, ids.adminMyKortix, { onBehalfOf: OTHER }), ids.run)).toBeNull();
  });

  test('My Kortix turned off in kortix.yaml reads nothing extra', async () => {
    expect(await read(await myKortix(ADMIN, ids.adminMyKortix, { grant: MY_KORTIX_OFF }), ids.run)).toBeNull();
  });

  test('a governed agent the admin started keeps its own narrow reach', async () => {
    const actor = await sessionActor({
      userId: ADMIN,
      sessionId: ids.adminGoverned,
      serviceAccountId: GOVERNED_SA,
      grant: { agent: 'engineering-gov', permissions: 'all', connectors: 'all', env: 'all' },
      onBehalfOf: ADMIN,
    });
    expect(actor.credential.kind === 'agent_session' && actor.credential.agentPrincipal).toBe(true);
    expect(await read(actor, ids.run)).toBeNull();
  });
});

describe('account oversight: sessions no person owns, never a member`s private chat', () => {
  test('oversight off: the agent-owned private session stays closed', async () => {
    await setOversight(false);
    expect(await read(await myKortix(ADMIN, ids.adminMyKortix), ids.agentPrivate)).toBeNull();
  });

  test('oversight on: My Kortix reads the agent-owned session, and the read is audited with its session', async () => {
    await setOversight(true);
    const access = await read(await myKortix(ADMIN, ids.adminMyKortix), ids.agentPrivate);
    expect(access?.row.sessionId).toBe(ids.agentPrivate);
    expect(access?.canManageLifecycle).toBe(false);
    const events = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.accountId, project.account_id), eq(auditEvents.action, 'project.admin_oversight_session_read'), eq(auditEvents.resourceId, ids.agentPrivate)));
    expect(events.some((event) => (event.metadata as Record<string, unknown> | null)?.myKortixSessionId === ids.adminMyKortix)).toBe(true);
  });

  test('oversight on: the admin opens another member`s private chat, My Kortix does not', async () => {
    await setOversight(true);
    expect((await read(human(ADMIN), ids.memberChat))?.row.sessionId).toBe(ids.memberChat);
    expect(await read(await myKortix(ADMIN, ids.adminMyKortix), ids.memberChat)).toBeNull();
  });
});

describe('`kortix sessions ls` lists what My Kortix may now read', () => {
  const list = async (actor: Actor, manager: boolean) => {
    const bound = actor.credential.kind === 'agent_session' ? actor.credential.sessionId : null;
    const inventory = await loadProjectSessionInventory({
      actor,
      projectId: project.project_id,
      accountId: project.account_id,
      userId: actor.userId,
      scope: 'visible',
      boundCredentialSessionId: bound,
      agentPrincipal: false,
      probeManageCapability: async () => manager,
      limit: 100,
    });
    return inventory.items.map((item) => item.row.sessionId);
  };

  test('the admin`s My Kortix lists the cron run, not the backend run or a member`s chat', async () => {
    await setOversight(true);
    const listed = await list(await myKortix(ADMIN, ids.adminMyKortix), true);
    expect(listed).toContain(ids.run);
    expect(listed).toContain(ids.adminMyKortix);
    expect(listed).not.toContain(ids.backendRun);
    expect(listed).not.toContain(ids.memberChat);
    // Oversight widens only the manager inventory, for the person too.
    expect(listed).not.toContain(ids.agentPrivate);
  });

  test('without manager standing, or when nobody prompted the turn, the list is unchanged', async () => {
    expect(await list(await myKortix(ADMIN, ids.adminMyKortix), false)).not.toContain(ids.run);
    expect(await list(await myKortix(ADMIN, ids.adminMyKortix, { onBehalfOf: null }), true)).not.toContain(ids.run);
  });
});
