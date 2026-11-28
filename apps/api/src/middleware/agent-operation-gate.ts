/**
 * The agent rule gate: every request an agent session makes to the Kortix API
 * is decided by its operation's rules before the handler runs
 * (`iam/kortix-rules.ts`). People, personal tokens and workspace keys are not
 * gated here; their IAM role decides in the handler, as it does for agents.
 *
 * Called by the auth middleware right after it accepts a session token, so it
 * covers every authenticated route, wherever its auth is mounted.
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { loadProjectPoliciesFor } from '../connectors/project-policies';
import type { Policy } from '../connectors/policy';
import { type KortixRuleDecision, decideKortixOperation, isKortixPolicy } from '../iam/kortix-rules';
import { pathParams, requestOperation, type Operation } from '../shared/operation-registry';
import { getAgentGrant } from './agent-scope';

/** True for a token bound to a session: the credential every agent session holds. */
function isAgentSessionRequest(c: Context): boolean {
  return c.get('authType') === 'pat' && Boolean(c.get('sessionId'));
}

/** The request's arguments for rules with conditions: path parameters, query, JSON body. */
async function requestArgs(c: Context, routePath: string): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = { ...c.req.query(), ...pathParams(routePath, c.req.path) };
  if ((c.req.header('content-type') ?? '').toLowerCase().includes('application/json')) {
    // Hono caches the parsed body, so the handler reads the same value.
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === 'object' && !Array.isArray(body)) Object.assign(args, body);
  }
  return args;
}

function refusal(operation: Operation, decision: KortixRuleDecision): HTTPException {
  const code = decision.source === 'exposure' ? 'operation_not_for_agents' : decision.action === 'block' ? 'policy_block' : 'approval_required';
  const message =
    decision.source === 'exposure'
      ? `"${operation.id}" is for people only. Ask a person in the workspace to do it.`
      : decision.source === 'agent_permissions'
        ? `This agent may not run "${operation.id}" (action "${operation.action}"). Add the action to its kortix_permissions, or give it a policy set on the kortix connector, in kortix.yaml.`
        : decision.action === 'block'
          ? `A rule blocks "${operation.id}" for agents${decision.rule ? ` (match "${decision.rule.match}")` : ''}.`
          : `A rule asks a person to approve "${operation.id}" first${decision.rule ? ` (match "${decision.rule.match}")` : ''}.`;
  const body = { error: true, status: 403, code, operation: operation.id, action: operation.action, source: decision.source, message };
  return new HTTPException(403, {
    message,
    res: new Response(JSON.stringify(body), { status: 403, headers: { 'content-type': 'application/json' } }),
  });
}

/**
 * Decide the request. Allow returns; block (and, until held Kortix calls
 * land, ask) throws a coded 403.
 */
export async function gateAgentOperation(c: Context): Promise<void> {
  if (!isAgentSessionRequest(c)) return;
  const matched = requestOperation(c);
  if (!matched) return;
  const { operation, path } = matched;
  const projectId = (c.get('tokenProjectId') as string | undefined) ?? null;
  const projectPolicies: Policy[] = projectId ? (await loadProjectPoliciesFor(projectId)).filter(isKortixPolicy) : [];
  const conditional = projectPolicies.some((p) => (p.conditions?.length ?? 0) > 0 || p.conditionsInvalid);
  const decision = decideKortixOperation({
    operation,
    grant: getAgentGrant(c),
    projectPolicies,
    ...(conditional ? { args: await requestArgs(c, path), argsAvailable: true } : {}),
  });
  c.set('operation', operation);
  if (decision.action === 'always_run') return;
  throw refusal(operation, decision);
}
