/**
 * The workspace's project-level rules (`policies:` in kortix.yaml), as the
 * rule engine reads them. Small on purpose: the agent rule gate runs inside
 * auth on every agent request and loads only this.
 */
import { connectorProjectPolicies } from '@kortix/db';
import { eq } from 'drizzle-orm';
import { db } from '../shared/db';
import { type Policy, type PolicyAction, parseStoredConditions } from './policy';

export function toPolicy(r: { match: string; action: PolicyAction; position: number; conditions: unknown }): Policy {
  return {
    match: r.match,
    action: r.action,
    position: r.position,
    // Conditions are re-validated on READ, never trusted from storage.
    ...parseStoredConditions(r.conditions),
  };
}

export async function loadProjectPoliciesFor(projectId: string): Promise<Policy[]> {
  const rows = await db.select().from(connectorProjectPolicies).where(eq(connectorProjectPolicies.projectId, projectId));
  return rows.map((r) => toPolicy({ ...r, action: r.action as PolicyAction }));
}
