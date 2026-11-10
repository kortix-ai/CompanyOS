/**
 * Real-Postgres contract for the connector reach a session inherits down its
 * spawn line (`sessionConnectorLineage`, `principalMayUseConnector`).
 *
 * A session a channel created reaches that channel's connector under any
 * grant. A session spawned by another session (a subagent: a built-in, a fork,
 * an inline colleague, a named agent) exists to do its parent's work, so it
 * inherits the parent's reach: the channel connector that created any session
 * on its spawn line, and every ancestor's stored agent grant, nearest parent
 * first (KRTX-4643). A delegate never reaches more than the line above it:
 * an unknown or unlinked session reaches none of it, and the walk is bounded.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { accountTokens, accounts, connectors, projectSessions, projects } from '@kortix/db';
import { eq } from 'drizzle-orm';
import { sessionConnectorLineage } from './db-deps-principal';
import { db } from '../shared/db';

const ACCOUNT = crypto.randomUUID();
const PROJECT = crypto.randomUUID();
const USER = crypto.randomUUID();
const ROOT = crypto.randomUUID();
const COLLEAGUE = crypto.randomUUID();
const GRANDCHILD = crypto.randomUUID();
const NAMED = crypto.randomUUID();
const BELOW_NAMED = crypto.randomUUID();
const UNLINKED = crypto.randomUUID();

const session = (sessionId: string, agentName: string, parentSessionId: string | null, source: string) => ({
  sessionId,
  accountId: ACCOUNT,
  projectId: PROJECT,
  branchName: sessionId,
  createdBy: USER,
  visibility: 'project' as const,
  agentName,
  parentSessionId,
  metadata: { source },
});

const GRANT = (agent: string, connectors: string[]) => ({
  agent,
  connectors,
  permissions: [],
  env: [],
  manifestRevision: 'd'.repeat(40),
  manifestCommit: 'c'.repeat(40),
});

beforeAll(async () => {
  await db.insert(accounts).values({ accountId: ACCOUNT, name: 'channel-inherit-test' });
  await db.insert(projects).values({
    projectId: PROJECT,
    accountId: ACCOUNT,
    name: 'channel-inherit-test',
    repoUrl: 'https://example.test/channel-inherit.git',
  });
  await db.insert(connectors).values({
    connectorId: crypto.randomUUID(),
    accountId: ACCOUNT,
    projectId: PROJECT,
    slug: 'kortix_slack',
    name: 'Slack',
    providerType: 'channel',
    config: { platform: 'slack' },
  });
  await db.insert(projectSessions).values([
    session(ROOT, 'mykortix', null, 'slack'),
    session(COLLEAGUE, 'mykortix', ROOT, 'agent'),
    session(GRANDCHILD, 'mykortix', COLLEAGUE, 'agent'),
    session(NAMED, 'compliance-officer', ROOT, 'agent'),
    session(BELOW_NAMED, 'compliance-officer', NAMED, 'agent'),
    session(UNLINKED, 'mykortix', null, 'agent'),
  ]);
  // The Slack-created root holds a stored grant that covers only GitHub: a
  // spawned child inherits that reach beside the channel.
  await db.insert(accountTokens).values({
    accountId: ACCOUNT,
    userId: USER,
    name: 'root session token',
    publicKey: 'pk'.repeat(32),
    secretKeyHash: 'sk'.repeat(64),
    projectId: PROJECT,
    sessionId: ROOT,
    status: 'active',
    agentGrant: GRANT('mykortix', ['github']),
  });
  // The named agent between ROOT and BELOW_NAMED holds an empty grant: it
  // reaches nothing itself, and the walk still carries the line's farther grants.
  await db.insert(accountTokens).values({
    accountId: ACCOUNT,
    userId: USER,
    name: 'named session token',
    publicKey: 'pn'.repeat(32),
    secretKeyHash: 'sn'.repeat(64),
    projectId: PROJECT,
    sessionId: NAMED,
    status: 'active',
    agentGrant: GRANT('compliance-officer', []),
  });
  // A revoked token grants nothing: a dead credential stays dead.
  await db.insert(accountTokens).values({
    accountId: ACCOUNT,
    userId: USER,
    name: 'root session token (revoked)',
    publicKey: 'pr'.repeat(32),
    secretKeyHash: 'sr'.repeat(64),
    projectId: PROJECT,
    sessionId: UNLINKED,
    status: 'revoked',
    revokedAt: new Date('2026-01-01T00:00:00.000Z'),
    agentGrant: GRANT('mykortix', ['stripe']),
  });
});

afterAll(async () => {
  await db.delete(accountTokens).where(eq(accountTokens.accountId, ACCOUNT));
  await db.delete(projectSessions).where(eq(projectSessions.projectId, PROJECT));
  await db.delete(connectors).where(eq(connectors.projectId, PROJECT));
  await db.delete(projects).where(eq(projects.projectId, PROJECT));
  await db.delete(accounts).where(eq(accounts.accountId, ACCOUNT));
});

describe('the connector reach a session inherits down its spawn line', () => {
  test('the session Slack created reaches the Slack channel connector', async () => {
    expect(await sessionConnectorLineage(PROJECT, ROOT)).toEqual({ channelSlugs: ['kortix_slack'], ancestorGrants: [] });
  });

  test('a child that runs as its parent\'s agent reaches it, and so does its own same-agent child', async () => {
    expect(await sessionConnectorLineage(PROJECT, COLLEAGUE)).toEqual({ channelSlugs: ['kortix_slack'], ancestorGrants: [GRANT('mykortix', ['github'])] });
    // COLLEAGUE holds no token of its own: it contributes a null entry, and the walk carries on.
    expect(await sessionConnectorLineage(PROJECT, GRANDCHILD)).toEqual({ channelSlugs: ['kortix_slack'], ancestorGrants: [null, GRANT('mykortix', ['github'])] });
  });

  test('a child of another agent inherits the channel and the parent line\'s stored grants (KRTX-4643)', async () => {
    const lineage = await sessionConnectorLineage(PROJECT, NAMED);
    expect(lineage.channelSlugs).toEqual(['kortix_slack']);
    expect(lineage.ancestorGrants).toEqual([GRANT('mykortix', ['github'])]);
    // The inheritance is transitive: the named child's own child reaches it too.
    const below = await sessionConnectorLineage(PROJECT, BELOW_NAMED);
    expect(below.channelSlugs).toEqual(['kortix_slack']);
    expect(below.ancestorGrants).toEqual([GRANT('compliance-officer', []), GRANT('mykortix', ['github'])]);
  });

  test('a session no channel created reaches none, and a revoked token grants nothing', async () => {
    expect(await sessionConnectorLineage(PROJECT, UNLINKED)).toEqual({ channelSlugs: [], ancestorGrants: [] });
    expect(await sessionConnectorLineage(PROJECT, crypto.randomUUID())).toEqual({ channelSlugs: [], ancestorGrants: [] });
    // The session belongs to this project only.
    expect(await sessionConnectorLineage(crypto.randomUUID(), ROOT)).toEqual({ channelSlugs: [], ancestorGrants: [] });
  });
});
