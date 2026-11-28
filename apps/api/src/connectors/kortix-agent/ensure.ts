/**
 * `kortix` is in every project, but a project whose connectors never synced
 * (no kortix.yaml, or no sync since it was created) has no row for it yet.
 * The first call that finds it missing syncs it once and calls again.
 */
import type { CallResult } from '../gateway';
import { KORTIX_CONNECTOR_SLUG } from '../../iam/kortix-rules';

export async function withKortixConnector(
  projectId: string,
  accountId: string,
  connectorSlug: string,
  call: () => Promise<CallResult>,
): Promise<CallResult> {
  const first = await call();
  if (connectorSlug !== KORTIX_CONNECTOR_SLUG) return first;
  if (first.status !== 'denied' || (first.reason !== 'connector_not_found' && first.reason !== 'action_not_found')) return first;
  const { syncProjectConnectors } = await import('../sync');
  await syncProjectConnectors(projectId, accountId, { onlySlugs: new Set([KORTIX_CONNECTOR_SLUG]) });
  return call();
}
