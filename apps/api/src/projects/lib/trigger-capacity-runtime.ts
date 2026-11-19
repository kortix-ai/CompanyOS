import { and, eq, inArray } from 'drizzle-orm';
import { accountSecretResources } from '@kortix/db';
import { db } from '../../shared/db';
import { listUsableGatewaySecrets } from '../../secrets/account-resource';
import { readSubscriptionCapacity } from '../../llm-gateway/subscription-usage';
import { servableProjectCatalog } from '../../llm-gateway/models/servable-catalog';
import { selectTriggerCapacityModel } from './trigger-capacity';

export async function triggerCapacityModel(input: { accountId: string; projectId: string; actor: string; model: string | null; fallbacks?: string[] }) {
  if (!input.model?.startsWith('claude-agent/') || !input.fallbacks?.length) return { model: input.model };
  const keys = await listUsableGatewaySecrets({ accountId: input.accountId, projectId: input.projectId, userId: input.actor, grantUserId: null, providerId: 'claude-agent', name: 'CLAUDE_CODE_OAUTH_TOKEN' });
  if (!keys.length) throw new Error('No project-shared Claude capacity evidence');
  const rows = await db.select().from(accountSecretResources).where(and(eq(accountSecretResources.accountId, input.accountId), eq(accountSecretResources.active, true), inArray(accountSecretResources.secretId, keys.map(key => key.secretId))));
  if (rows.some(row => row.needsReauthAt)) throw new Error('Shared Claude requires reconnection');
  const snapshots = await Promise.all(rows.map(row => readSubscriptionCapacity(row)));
  const catalog = await servableProjectCatalog({accountId: input.accountId, projectId: input.projectId, principalUserId: input.actor, personalUserId: null});
  return selectTriggerCapacityModel({model: input.model, fallbacks: input.fallbacks, snapshots, available: Object.entries(catalog.models).filter(([,model]) => model.enabled && model.available !== false).map(([id]) => id), now: Date.now()});
}
