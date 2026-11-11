/**
 * The project delivery floor (`projects.secret_default_strategy`) must not
 * withhold a secret without anybody noticing.
 *
 * `resolveSecretDelivery` composes the floor with each row's own strategy as a
 * MAX. A floor of `egress` raises every `runtime` row to `egress`, and
 * `materializeSecretDelivery` then drops any row that has no host list: the
 * env var vanishes from every session. A floor of `broker` does the same to
 * every row that is not a `kortix_fetch` broker row. The PATCH that sets the
 * floor reads `secretsWithheldByFloor` and refuses when the list is not empty.
 */
import { projectSecrets } from '@kortix/db';
import { and, eq, isNull } from 'drizzle-orm';
import { isGatewayManagedEnv } from '../../llm-gateway/sandbox-credentials';
import {
  STRATEGY_RANK,
  type SecretConsumer,
  type SecretEgressPolicy,
  type SecretStrategy,
  maxStrategy,
} from '../../secrets/strategy';
import { db } from '../../shared/db';
import { gatewayStripsRow } from '../secrets';

/** The row fields the delivery decision reads. */
export interface FloorGuardRow {
  identifier: string;
  name: string;
  strategy: SecretStrategy | null;
  consumer: SecretConsumer | null;
  egressPolicy: SecretEgressPolicy | null;
}

/**
 * The consumer `materializeSecretDelivery` reads for a row at a strategy. A
 * stamped consumer wins; a legacy row with none derives it from the strategy.
 */
function effectiveConsumer(row: FloorGuardRow, strategy: SecretStrategy): SecretConsumer | null {
  if (row.consumer) return row.consumer;
  if (strategy === 'runtime') return 'sandbox';
  if (row.egressPolicy?.backend === 'kortix_fetch') return 'http_broker';
  return (row.egressPolicy?.backend ?? null) as SecretConsumer | null;
}

/** Does a row still reach a session at this strategy? Mirrors `materializeSecretDelivery`. */
function servedAt(row: FloorGuardRow, strategy: SecretStrategy): boolean {
  const consumer = effectiveConsumer(row, strategy);
  if (strategy === 'runtime') return consumer === 'sandbox';
  if (strategy === 'egress') return consumer === 'network' && (row.egressPolicy?.rules?.length ?? 0) > 0;
  if (strategy === 'broker') return consumer === 'http_broker' && row.egressPolicy?.backend === 'kortix_fetch';
  return false;
}

/**
 * The identifiers a floor would withhold that reach sessions today, sorted.
 *
 * Only rows the floor RAISES count: a row already at or above the floor is
 * delivered the same way before and after the change. A `denied` floor is a
 * deliberate "withhold everything" and is never refused here.
 */
export function secretsWithheldByFloor(rows: readonly FloorGuardRow[], floor: SecretStrategy): string[] {
  if (floor === 'runtime' || floor === 'denied') return [];
  const withheld = new Set<string>();
  for (const row of rows) {
    if (row.name.toUpperCase().startsWith('KORTIX_')) continue;
    const own = row.strategy ?? 'runtime';
    if (STRATEGY_RANK[floor] <= STRATEGY_RANK[own]) continue;
    // A row the gateway strips never reaches a session at any floor.
    if (gatewayStripsRow({ nameIsGatewayManaged: isGatewayManagedEnv(row.name), consumer: row.consumer })) continue;
    if (!servedAt(row, own)) continue;
    if (!servedAt(row, maxStrategy(own, floor))) withheld.add(row.identifier);
  }
  return [...withheld].sort();
}

/** `secretsWithheldByFloor` over the project's shared runtime rows. */
export async function listSecretsWithheldByFloor(projectId: string, floor: SecretStrategy): Promise<string[]> {
  if (floor === 'runtime' || floor === 'denied') return [];
  const rows = await db
    .select({
      identifier: projectSecrets.identifier,
      name: projectSecrets.name,
      strategy: projectSecrets.strategy,
      consumer: projectSecrets.consumer,
      egressPolicy: projectSecrets.egressPolicy,
    })
    .from(projectSecrets)
    .where(
      and(
        eq(projectSecrets.projectId, projectId),
        eq(projectSecrets.scope, 'runtime'),
        isNull(projectSecrets.ownerUserId),
      ),
    );
  return secretsWithheldByFloor(rows, floor);
}

/** The `409` the floor PATCH answers. Names every withheld identifier and the fix. */
export function floorWithholdsBody(floor: SecretStrategy, withheld: readonly string[]): {
  error: string;
  code: 'secret_floor_withholds';
  floor: SecretStrategy;
  withheld: string[];
  fix: string;
} {
  const fix =
    floor === 'egress'
      ? 'Give each secret a host so it is delivered at the network, or keep the default at runtime.'
      : 'Move each secret to broker delivery, or keep the default at runtime.';
  return {
    error: `A default of ${floor} withholds ${withheld.length} secret${withheld.length === 1 ? '' : 's'} from every session: ${withheld.join(', ')}. ${fix}`,
    code: 'secret_floor_withholds',
    floor,
    withheld: [...withheld],
    fix,
  };
}
