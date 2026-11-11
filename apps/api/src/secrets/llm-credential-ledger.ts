/**
 * The read gate of the LLM credential move (`llm-credential-move.ts`), kept
 * free of the gateway and catalog imports so the legacy secret readers
 * (`projects/secrets/consumer-resolution.ts`) can apply it without a cycle.
 */
import { llmCredentialBackfill, projectSecrets } from '@kortix/db';
import { sql, type SQL } from 'drizzle-orm';

/** Outcomes after which a legacy `llm_gateway` secret is never read again. */
export const LLM_CREDENTIAL_MOVED_OUTCOMES = ['copied', 'already_present', 'superseded'] as const;

/**
 * SQL for "this legacy `project_secrets` row has not moved to the named
 * store": every legacy `llm_gateway` read ANDs it in. A moved row's named
 * account serves instead, and deleting that account in the Models panel does
 * not bring the old value back.
 */
export function legacySecretNotMoved(secretId: SQL | typeof projectSecrets.secretId = projectSecrets.secretId): SQL {
  return sql`not exists (select 1 from ${llmCredentialBackfill} where ${llmCredentialBackfill.legacySecretId} = ${secretId} and ${llmCredentialBackfill.outcome} in (${sql.join(LLM_CREDENTIAL_MOVED_OUTCOMES.map((o) => sql`${o}`), sql`, `)}))`;
}
