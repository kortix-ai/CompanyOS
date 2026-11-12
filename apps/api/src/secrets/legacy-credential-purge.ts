/**
 * The last step of the legacy credential migration: delete the legacy rows no
 * reader reads any more. It runs only after the backfills ran in the
 * environment, and it refuses when they did not.
 *
 * What it deletes:
 *   - `project_secrets` rows with consumer `llm_gateway` whose
 *     `llm_credential_backfill` outcome says they moved (`copied`,
 *     `already_present`, `superseded`) or that no reader reads them
 *     (`skipped_unread`, `skipped_inactive`, `skipped_no_account`), and that
 *     were not written since.
 *   - every `claude_subscription_logins` row (retired 2026-11-05; no reader).
 *   - every `user_provider_connections` row and its grants (never had a reader).
 *
 * The gate (`planLegacyCredentialPurge`): it refuses while
 *   - an `llm_gateway` row has no ledger row, or was written after its move
 *     (run `llm-credential-backfill.ts --apply` again), or
 *   - an `llm_gateway` row stays legacy because the named store cannot hold it
 *     (`skipped_audience`, `skipped_no_owner`, `failed_undecryptable`), unless
 *     the operator passes `acceptUnmovable` after deciding each one.
 * Those rows are counted, never deleted silently.
 */
import { claudeSubscriptionLogins, llmCredentialBackfill, projectSecrets, projectUserProviderConnections, sessionUserProviderConnections, userProviderConnections } from '@kortix/db';
import { sql } from 'drizzle-orm';
import { db } from '../shared/db';
import { LLM_CREDENTIAL_MOVED_OUTCOMES } from './llm-credential-ledger';

// `skipped_no_account`: the project has no account, so no reader reaches the row.
const DELETABLE_OUTCOMES = [...LLM_CREDENTIAL_MOVED_OUTCOMES, 'skipped_unread', 'skipped_inactive', 'skipped_no_account'] as const;
const UNMOVABLE_OUTCOMES = ['skipped_audience', 'skipped_no_owner', 'failed_undecryptable'] as const;

// `legacy_updated_at` is written from a JS Date (milliseconds); `updated_at`
// has microseconds. Compare at the precision the backfill recorded.
const list = (values: readonly string[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);

export interface LegacyCredentialPurgePlan {
  /** Legacy `llm_gateway` rows. */
  llmRows: number;
  /** Rows the backfill has not seen, or that changed after their move. */
  notCurrent: number;
  /** Rows the named store cannot hold, by outcome. */
  unmovable: Record<string, number>;
  /** Rows the purge deletes. */
  deletable: number;
  claudeLogins: number;
  userProviderConnections: number;
  /** Null when the purge may run; else why it refuses. */
  refusal: string | null;
}

export async function planLegacyCredentialPurge(options: { acceptUnmovable?: boolean } = {}): Promise<LegacyCredentialPurgePlan> {
  const [counts] = (await db.execute(sql`
    select
      count(*)::int as llm_rows,
      count(*) filter (where l.legacy_secret_id is null
        or (l.outcome in (${list(LLM_CREDENTIAL_MOVED_OUTCOMES)}) and date_trunc('milliseconds', s.updated_at) > l.legacy_updated_at))::int as not_current,
      count(*) filter (where l.outcome in (${list(DELETABLE_OUTCOMES)})
        and (l.outcome not in (${list(LLM_CREDENTIAL_MOVED_OUTCOMES)}) or date_trunc('milliseconds', s.updated_at) <= l.legacy_updated_at))::int as deletable
    from ${projectSecrets} s
    left join ${llmCredentialBackfill} l on l.legacy_secret_id = s.secret_id
    where s.consumer = 'llm_gateway'
  `)) as unknown as Array<{ llm_rows: number; not_current: number; deletable: number }>;
  const unmovableRows = (await db.execute(sql`
    select l.outcome, count(*)::int as n
    from ${projectSecrets} s join ${llmCredentialBackfill} l on l.legacy_secret_id = s.secret_id
    where s.consumer = 'llm_gateway' and l.outcome in (${list(UNMOVABLE_OUTCOMES)})
    group by l.outcome
  `)) as unknown as Array<{ outcome: string; n: number }>;
  const [claude] = (await db.execute(sql`select count(*)::int as n from ${claudeSubscriptionLogins}`)) as unknown as Array<{ n: number }>;
  const [upc] = (await db.execute(sql`select count(*)::int as n from ${userProviderConnections}`)) as unknown as Array<{ n: number }>;

  const unmovable = Object.fromEntries(unmovableRows.map((r) => [r.outcome, r.n]));
  const unmovableTotal = unmovableRows.reduce((sum, r) => sum + r.n, 0);
  const c = counts ?? { llm_rows: 0, not_current: 0, deletable: 0 };
  let refusal: string | null = null;
  if (c.not_current > 0) {
    refusal = `${c.not_current} legacy llm_gateway rows are not moved or changed after their move: run llm-credential-backfill.ts --apply first`;
  } else if (unmovableTotal > 0 && !options.acceptUnmovable) {
    refusal = `${unmovableTotal} legacy llm_gateway rows cannot move (${Object.entries(unmovable).map(([o, n]) => `${o} ${n}`).join(', ')}): decide each one, then pass --accept-unmovable`;
  }
  return {
    llmRows: c.llm_rows,
    notCurrent: c.not_current,
    unmovable,
    deletable: c.deletable + (options.acceptUnmovable ? unmovableTotal : 0),
    claudeLogins: claude?.n ?? 0,
    userProviderConnections: upc?.n ?? 0,
    refusal,
  };
}

export interface LegacyCredentialPurgeResult extends LegacyCredentialPurgePlan {
  deleted: { llmRows: number; claudeLogins: number; userProviderConnections: number } | null;
}

/** Plan, and with `apply` delete, in one transaction. A refused plan deletes nothing. */
export async function purgeLegacyCredentials(options: { apply: boolean; acceptUnmovable?: boolean }): Promise<LegacyCredentialPurgeResult> {
  const plan = await planLegacyCredentialPurge(options);
  if (!options.apply || plan.refusal) return { ...plan, deleted: null };
  const outcomes = options.acceptUnmovable ? [...DELETABLE_OUTCOMES, ...UNMOVABLE_OUTCOMES] : [...DELETABLE_OUTCOMES];
  const deleted = await db.transaction(async (tx) => {
    // The gate is checked again under the transaction: a legacy write after the plan keeps its row.
    const llm = (await tx.execute(sql`
      delete from ${projectSecrets} s
      using ${llmCredentialBackfill} l
      where l.legacy_secret_id = s.secret_id and s.consumer = 'llm_gateway'
        and l.outcome in (${list(outcomes)})
        and (l.outcome not in (${list(LLM_CREDENTIAL_MOVED_OUTCOMES)}) or date_trunc('milliseconds', s.updated_at) <= l.legacy_updated_at)
      returning s.secret_id
    `)) as unknown as unknown[];
    const claude = await tx.delete(claudeSubscriptionLogins).returning({ userId: claudeSubscriptionLogins.userId });
    await tx.delete(sessionUserProviderConnections);
    await tx.delete(projectUserProviderConnections);
    const upc = await tx.delete(userProviderConnections).returning({ connectionId: userProviderConnections.connectionId });
    return { llmRows: llm.length, claudeLogins: claude.length, userProviderConnections: upc.length };
  });
  return { ...plan, deleted };
}
