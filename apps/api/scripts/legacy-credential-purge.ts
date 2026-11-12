/**
 * Operator step after the legacy credential backfills: delete the legacy rows
 * no reader reads (`apps/api/src/secrets/legacy-credential-purge.ts`).
 *
 *   dotenvx run -f apps/api/.env.<env> -- bun run apps/api/scripts/legacy-credential-purge.ts           # plan only
 *   dotenvx run -f apps/api/.env.<env> -- bun run apps/api/scripts/legacy-credential-purge.ts --apply   # delete
 *   ... --accept-unmovable   also delete the llm_gateway rows the named store cannot hold, after deciding each one
 *
 * It refuses (exit 2) while a legacy LLM key is not moved yet. Run
 * `llm-credential-backfill.ts --apply` first. It never reads a value.
 */
import { purgeLegacyCredentials } from '../src/secrets/legacy-credential-purge';

const args = process.argv.slice(2);
for (const a of args) if (a !== '--apply' && a !== '--accept-unmovable') throw new Error(`unknown arg ${a}`);
const apply = args.includes('--apply');
const result = await purgeLegacyCredentials({ apply, acceptUnmovable: args.includes('--accept-unmovable') });

const out = (line: string) => process.stdout.write(`${line}\n`);
out(`legacy llm_gateway rows        ${result.llmRows}`);
out(`  not moved or changed since   ${result.notCurrent}`);
out(`  cannot move                  ${Object.entries(result.unmovable).map(([o, n]) => `${o} ${n}`).join(', ') || '0'}`);
out(`  deletable                    ${result.deletable}`);
out(`claude_subscription_logins     ${result.claudeLogins}`);
out(`user_provider_connections      ${result.userProviderConnections}`);
if (result.refusal) {
  out(`\nREFUSED: ${result.refusal}`);
  process.exit(2);
}
if (!result.deleted) {
  out('\nPLAN ONLY (no writes; pass --apply)');
  process.exit(0);
}
out(`\nDELETED: ${result.deleted.llmRows} llm_gateway rows, ${result.deleted.claudeLogins} Claude logins, ${result.deleted.userProviderConnections} user provider connections`);
process.exit(0);
