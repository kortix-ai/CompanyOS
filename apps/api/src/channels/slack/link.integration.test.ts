/**
 * Real-Postgres contract for one Slack workspace, one Kortix workspace
 * (link.ts) and for linking Slack people by confirmed email (auto-link.ts).
 * Real: chat_installs, project_secrets, chat_channel_bindings,
 * project_sessions, chat_user_identities, account members and auth.users rows.
 * Faked: Slack's Web API (users.info, users.lookupByEmail).
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { accountMembers, chatChannelBindings, chatInstalls, chatUserIdentities, projectSecrets, projectSessions } from '@kortix/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../shared/db';
import { insertIntoView } from '../../__tests__/helpers/compat-views';
import { removeSeeded, seedProject, seedSession, type SeededProject } from '../../__tests__/helpers/integration-fixtures';
import { chatUser, lookupChatIdentity } from '../core/identity';
import { saveSlackInstall, saveSlackOauthInstall, upsertSecret } from '../install-store';
import { linkSlackPersonByEmail, slackPersonForKortixUser } from './auto-link';
import { holdsSlackWorkspace, linkedSlackProject, moveSlackLink, recordSlackChannel, slackProjectLink } from './link';

const RUN = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
const team = (name: string) => `T${name}${RUN}`;

let a: SeededProject;
let b: SeededProject;
let byo: SeededProject;
const MEMBER = crypto.randomUUID();
const OUTSIDER = crypto.randomUUID();
const memberEmail = `member-${RUN.toLowerCase()}@example.test`;
const outsiderEmail = `outsider-${RUN.toLowerCase()}@example.test`;

const shared = (projectId: string, workspaceId: string) =>
  saveSlackOauthInstall({ projectId, workspaceId, botToken: 'xoxb-synthetic', botUserId: 'U0BOT', teamName: 'synthetic' });
const installsOf = async (workspaceId: string) =>
  (
    await db
      .select({ projectId: chatInstalls.projectId })
      .from(chatInstalls)
      .where(and(eq(chatInstalls.platform, 'slack'), eq(chatInstalls.platformTeamId, workspaceId)))
  )
    .map((r) => r.projectId)
    .sort();

beforeAll(async () => {
  a = await seedProject('slack-link-a');
  b = await seedProject('slack-link-b', { accountId: a.account_id });
  byo = await seedProject('slack-link-byo', { accountId: a.account_id });
  await db.execute(sql`
    insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
    values (${MEMBER}::uuid, ${memberEmail}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now()),
           (${OUTSIDER}::uuid, ${outsiderEmail}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`);
  await insertIntoView(db, accountMembers, { userId: MEMBER, accountId: a.account_id, accountRole: 'member' });
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(async () => {
  const ids = [a.project_id, b.project_id, byo.project_id];
  await db.delete(chatChannelBindings).where(inArray(chatChannelBindings.projectId, ids));
  await db.delete(chatInstalls).where(inArray(chatInstalls.projectId, ids));
  await db.delete(projectSecrets).where(inArray(projectSecrets.projectId, ids));
  await db.delete(projectSessions).where(inArray(projectSessions.projectId, ids));
  await db.delete(chatUserIdentities).where(inArray(chatUserIdentities.userId, [MEMBER, OUTSIDER]));
  await removeSeeded([a, b, byo]);
  await db.execute(sql`delete from auth.users where id in (${MEMBER}::uuid, ${OUTSIDER}::uuid)`);
});

describe('one Slack workspace, one Kortix workspace', () => {
  test('installing in another Kortix workspace moves the link: the first is detached, with its token and channel settings', async () => {
    const ws = team('MOVE');
    await shared(a.project_id, ws);
    await moveSlackLink(ws, a.project_id);
    await recordSlackChannel(a.project_id, ws, 'C0SETTINGS');
    expect(await linkedSlackProject(ws)).toBe(a.project_id);

    await shared(b.project_id, ws);
    expect(await moveSlackLink(ws, b.project_id)).toEqual([a.project_id]);

    expect(await installsOf(ws)).toEqual([b.project_id]);
    expect(await linkedSlackProject(ws)).toBe(b.project_id);
    expect(await slackProjectLink(a.project_id)).toBeNull();
    expect(await slackProjectLink(b.project_id)).toEqual({ teamId: ws });
    const aToken = await db
      .select({ name: projectSecrets.name })
      .from(projectSecrets)
      .where(and(eq(projectSecrets.projectId, a.project_id), eq(projectSecrets.name, 'SLACK_BOT_TOKEN')));
    expect(aToken).toEqual([]);
    const aChannels = await db.select().from(chatChannelBindings).where(eq(chatChannelBindings.projectId, a.project_id));
    expect(aChannels).toEqual([]);
  });

  test("a move in one Slack workspace leaves the detached Kortix workspace's install in another Slack workspace", async () => {
    const x = team('SCOPEX');
    const y = team('SCOPEY');
    await shared(a.project_id, y);
    await moveSlackLink(y, a.project_id);
    // `a` installed x last, so its Slack secrets are x's.
    await shared(a.project_id, x);
    await moveSlackLink(x, a.project_id);
    await shared(b.project_id, x);
    await moveSlackLink(x, b.project_id);

    expect(await installsOf(x)).toEqual([b.project_id]);
    expect(await installsOf(y)).toEqual([a.project_id]);
    expect(await linkedSlackProject(y)).toBe(a.project_id);
    expect(await slackProjectLink(a.project_id)).toEqual({ teamId: y });
  });

  test('several installs from before the move heal on first use: the one Slack used stays, the others are detached once', async () => {
    const ws = team('HEAL');
    await db.insert(chatInstalls).values([
      { platform: 'slack', platformTeamId: ws, projectId: a.project_id },
      { platform: 'slack', platformTeamId: ws, projectId: b.project_id },
    ]);
    // `a` installed first, but its Slack session makes it the one people use.
    const used = await seedSession(a, crypto.randomUUID());
    await db
      .update(projectSessions)
      .set({ metadata: { source: 'slack', slack: { team_id: ws } } })
      .where(eq(projectSessions.sessionId, used));

    expect(await linkedSlackProject(ws)).toBe(a.project_id);
    expect(await installsOf(ws)).toEqual([a.project_id]);
    expect(await linkedSlackProject(ws)).toBe(a.project_id);
  });

  test("a Kortix workspace's own Slack app keeps its link beside the shared app, and is never detached", async () => {
    const ws = team('BYO');
    await saveSlackInstall({ projectId: byo.project_id, teamId: ws, teamName: 'synthetic', botToken: 'xoxb-own', signingSecret: 'own', botUserId: 'U0OWN' });
    await shared(a.project_id, ws);
    await moveSlackLink(ws, a.project_id);

    expect(await installsOf(ws)).toEqual([a.project_id, byo.project_id].sort());
    expect(await linkedSlackProject(ws)).toBe(a.project_id);
    expect(await slackProjectLink(byo.project_id)).toEqual({ teamId: ws });
  });

  test('a shared-app install that plants a signing secret is not an own app: it is detached like any duplicate', async () => {
    const ws = team('FAKE');
    // Two shared-app installs from before the move; `b` writes the secret an
    // own app stores, through the generic secrets path an admin can use.
    await db.insert(chatInstalls).values([
      { platform: 'slack', platformTeamId: ws, projectId: a.project_id },
      { platform: 'slack', platformTeamId: ws, projectId: b.project_id },
    ]);
    for (const project of [a, b]) await upsertSecret(project.project_id, 'SLACK_BOT_TOKEN', 'xoxb-shared-same');
    await upsertSecret(b.project_id, 'SLACK_SIGNING_SECRET', 'planted');
    const used = await seedSession(a, crypto.randomUUID());
    await db
      .update(projectSessions)
      .set({ metadata: { source: 'slack', slack: { team_id: ws } } })
      .where(eq(projectSessions.sessionId, used));

    expect(await linkedSlackProject(ws)).toBe(a.project_id);
    // The planted secret exempts nothing: `b` is detached here like any duplicate.
    expect(await installsOf(ws)).toEqual([a.project_id]);
    expect(await holdsSlackWorkspace(b.project_id, ws)).toBe(false);
    await db.delete(projectSecrets).where(and(eq(projectSecrets.projectId, b.project_id), eq(projectSecrets.name, 'SLACK_SIGNING_SECRET')));
  });

  test("a channel's settings row: recorded for the linked workspace, taken over from a detached one, kept for a workspace's own app", async () => {
    const ws = team('ROWS');
    await shared(b.project_id, ws);
    await moveSlackLink(ws, b.project_id);
    await saveSlackInstall({ projectId: byo.project_id, teamId: ws, teamName: 'synthetic', botToken: 'xoxb-own', signingSecret: 'own', botUserId: 'U0OWN' });
    await db.insert(chatChannelBindings).values([
      // Left by a Kortix workspace that has no Slack link here any more.
      { platform: 'slack', platformTeamId: ws, channelId: 'C0STALE', projectId: a.project_id, agentName: 'old-agent' },
      // A workspace that runs its own Slack app in the same Slack workspace.
      { platform: 'slack', platformTeamId: ws, channelId: 'C0OWNAPP', projectId: byo.project_id, agentName: 'own-agent' },
    ]);
    const row = async (channelId: string) =>
      (
        await db
          .select({ projectId: chatChannelBindings.projectId, agentName: chatChannelBindings.agentName })
          .from(chatChannelBindings)
          .where(and(eq(chatChannelBindings.platformTeamId, ws), eq(chatChannelBindings.channelId, channelId)))
      )[0];

    await recordSlackChannel(b.project_id, ws, 'C0NEW');
    await recordSlackChannel(b.project_id, ws, 'C0STALE');
    await recordSlackChannel(b.project_id, ws, 'C0OWNAPP');
    expect(await row('C0NEW')).toEqual({ projectId: b.project_id, agentName: null });
    expect(await row('C0STALE')).toEqual({ projectId: b.project_id, agentName: null });
    expect(await row('C0OWNAPP')).toEqual({ projectId: byo.project_id, agentName: 'own-agent' });
  });
});

describe('Slack people are linked by confirmed email', () => {
  /** Slack's answers: users.info and users.lookupByEmail. */
  function slack(people: Record<string, { email: string; confirmed: boolean }>) {
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const params = new URLSearchParams(String(init?.body ?? ''));
      const person = (id: string) => {
        const p = people[id];
        return p ? { ok: true, user: { id, is_email_confirmed: p.confirmed, profile: { email: p.email } } } : { ok: false, error: 'users_not_found' };
      };
      if (url.endsWith('/users.info')) return Response.json(person(params.get('user') ?? ''));
      if (url.endsWith('/users.lookupByEmail')) {
        const id = Object.keys(people).find((k) => people[k]!.email === params.get('email'));
        return Response.json(id ? person(id) : { ok: false, error: 'users_not_found' });
      }
      return Response.json({ ok: false, error: 'unexpected' });
    }) as typeof fetch;
  }

  test('a member with the same confirmed email is linked without /kortix login', async () => {
    const ws = team('MAIL');
    await shared(a.project_id, ws);
    await moveSlackLink(ws, a.project_id);
    slack({ U0MEMBER: { email: memberEmail, confirmed: true } });
    expect(await linkSlackPersonByEmail(chatUser('slack', ws, 'U0MEMBER'), a.project_id)).toBe(true);
    expect((await lookupChatIdentity(chatUser('slack', ws, 'U0MEMBER')))?.userId).toBe(MEMBER);
  });

  test('an unconfirmed Slack email, or a Kortix user who is not a member, links nobody', async () => {
    const ws = team('NOMAIL');
    await shared(a.project_id, ws);
    await moveSlackLink(ws, a.project_id);
    slack({ U0UNCONF: { email: memberEmail, confirmed: false }, U0OUT: { email: outsiderEmail, confirmed: true } });
    expect(await linkSlackPersonByEmail(chatUser('slack', ws, 'U0UNCONF'), a.project_id)).toBe(false);
    expect(await linkSlackPersonByEmail(chatUser('slack', ws, 'U0OUT'), a.project_id)).toBe(false);
    expect(await lookupChatIdentity(chatUser('slack', ws, 'U0UNCONF'))).toBeNull();
    expect(await lookupChatIdentity(chatUser('slack', ws, 'U0OUT'))).toBeNull();
  });

  test('an account that requires MFA links nobody by email: such people keep /kortix login', async () => {
    const ws = team('MFA');
    await shared(a.project_id, ws);
    await moveSlackLink(ws, a.project_id);
    await db.execute(sql`UPDATE kortix.accounts SET mfa_required = true WHERE account_id = ${a.account_id}::uuid`);
    try {
      slack({ U0MFA: { email: memberEmail, confirmed: true } });
      expect(await linkSlackPersonByEmail(chatUser('slack', ws, 'U0MFA'), a.project_id)).toBe(false);
      expect(await lookupChatIdentity(chatUser('slack', ws, 'U0MFA'))).toBeNull();
      expect(await slackPersonForKortixUser({ teamId: ws, userId: MEMBER, token: 'xoxb-synthetic', projectId: a.project_id })).toBeNull();
    } finally {
      await db.execute(sql`UPDATE kortix.accounts SET mfa_required = false WHERE account_id = ${a.account_id}::uuid`);
    }
  });

  test("a Kortix user's Slack person is found by their confirmed email, and a person linked to someone else is not taken", async () => {
    const ws = team('REV');
    await shared(a.project_id, ws);
    await moveSlackLink(ws, a.project_id);
    slack({ U0MEMBER: { email: memberEmail, confirmed: true } });
    expect(await slackPersonForKortixUser({ teamId: ws, userId: MEMBER, token: 'xoxb-synthetic', projectId: a.project_id })).toBe('U0MEMBER');
    // Linked now: the second lookup reads the link.
    globalThis.fetch = (async () => Response.json({ ok: false, error: 'should_not_call' })) as unknown as typeof fetch;
    expect(await slackPersonForKortixUser({ teamId: ws, userId: MEMBER, token: 'xoxb-synthetic', projectId: a.project_id })).toBe('U0MEMBER');
    // OUTSIDER has the address of a Slack person already linked to MEMBER: no.
    slack({ U0MEMBER: { email: outsiderEmail, confirmed: true } });
    expect(await slackPersonForKortixUser({ teamId: ws, userId: OUTSIDER, token: 'xoxb-synthetic', projectId: a.project_id })).toBeNull();
  });
});
