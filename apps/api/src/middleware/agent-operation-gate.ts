/**
 * The agent rule gate: every request an agent session makes to the Kortix API
 * is decided by its operation's rules before the handler runs
 * (`iam/kortix-rules.ts`). People, personal tokens and workspace keys are not
 * gated here; their IAM role decides in the handler, as it does for agents.
 *
 * Called by the auth middleware right after it accepts a session token, so it
 * covers every authenticated route, wherever its auth is mounted.
 *
 * Allow returns nothing. Block throws a coded 403. Ask hands the request to
 * the connector gateway as a `kortix` call and returns its answer: 202 with
 * the execution id while a person decides; the result when one already did.
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { CallResult } from '../connectors/gateway';
import { loadProjectPoliciesFor } from '../connectors/project-policies';
import type { Policy } from '../connectors/policy';
import { KORTIX_CONNECTOR_SLUG, type KortixRuleDecision, decideKortixOperation, isKortixPolicy } from '../iam/kortix-rules';
import { type Operation, operationById, pathParams, requestOperation } from '../shared/operation-registry';
import { sessionTrust } from '../shared/session-trust';
import { getAgentGrant } from './agent-scope';

/** What the agent tells the approver about a held call (the gateway's `approval_context`). */
export const APPROVAL_CONTEXT_HEADER = 'x-kortix-approval-context';

/** True for a token bound to a session: the credential every agent session holds. */
function isAgentSessionRequest(c: Context): boolean {
  return c.get('authType') === 'pat' && Boolean(c.get('sessionId'));
}

const isJson = (c: Context) => (c.req.header('content-type') ?? '').toLowerCase().includes('application/json');

/** The request's arguments for rules with conditions: path parameters, query, JSON body. */
async function requestArgs(c: Context, routePath: string): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = { ...c.req.query(), ...pathParams(routePath, c.req.path) };
  if (isJson(c)) {
    // Hono caches the parsed body, so the handler reads the same value.
    const body = await c.req.json().catch(() => null);
    if (body && typeof body === 'object' && !Array.isArray(body)) Object.assign(args, body);
  }
  return args;
}

/** The same request as `kortix` connector tool arguments: its parameters, and its JSON body as `body`. */
async function toolArgs(c: Context, routePath: string, operation: Operation): Promise<Record<string, unknown>> {
  const declared = operationById(operation.id);
  const params = pathParams(routePath, c.req.path);
  const query = c.req.query();
  const args: Record<string, unknown> = {};
  for (const p of declared?.parameters ?? []) {
    const value = p.in === 'path' ? params[p.name] : query[p.name];
    if (value !== undefined) args[p.name] = value;
  }
  if (declared?.body && isJson(c)) {
    const body = await c.req.json().catch(() => undefined);
    if (body !== undefined) args.body = body;
  }
  return args;
}

function json403(body: Record<string, unknown>, message: string): HTTPException {
  return new HTTPException(403, {
    message,
    res: new Response(JSON.stringify(body), { status: 403, headers: { 'content-type': 'application/json' } }),
  });
}

function refusal(operation: Operation, decision: KortixRuleDecision): HTTPException {
  const code =
    decision.source === 'exposure'
      ? 'operation_not_for_agents'
      : decision.source === 'agent_permissions'
        ? 'agent_scope_insufficient'
        : decision.source === 'untrusted'
          ? 'untrusted_session'
          : 'policy_block';
  const message =
    decision.source === 'exposure'
      ? `"${operation.id}" is for people only. Ask a person in the workspace to do it.`
      : decision.source === 'untrusted'
        ? `This session read a message from someone outside the workspace, so it may not run "${operation.id}". A person in the workspace can do it.`
        : decision.source === 'agent_permissions'
        ? `This agent may not run "${operation.id}" (action "${operation.action}"). Add the action to its kortix_permissions, or give it a policy set on the kortix connector, in kortix.yaml.`
        : `A rule blocks "${operation.id}" for agents${decision.rule ? ` (match "${decision.rule.match}")` : ''}.`;
  return json403(
    { error: true, status: 403, code, operation: operation.id, action: operation.action, source: decision.source, message },
    message,
  );
}

/** The gateway's answer to a held or run `kortix` call, as this route's response. */
function gatewayAnswer(operation: Operation, result: CallResult): Response {
  if (result.status === 'pending_approval') {
    return Response.json(
      {
        ok: false,
        status: 'pending_approval',
        operation: operation.id,
        reason: result.reason,
        execution_id: result.executionId ?? null,
        approval_url: result.approvalUrl ?? null,
        approval_summary: result.approvalSummary ?? null,
        approval_instructions: result.approvalInstructions ?? null,
        // Kortix runs the call after approval; the caller must not repeat it.
        ...(result.runsOnApproval ? { runs_on_approval: true } : {}),
      },
      { status: 202 },
    );
  }
  if (result.status === 'ok') {
    if (result.upstreamError) {
      throw json403(
        { error: true, status: 403, code: 'approved_call_failed', operation: operation.id, message: result.upstreamError },
        result.upstreamError,
      );
    }
    // A person approved this exact call before: the gateway ran it, as this caller.
    const ran = (result.data ?? {}) as { status?: number; data?: unknown };
    return Response.json(ran.data ?? null, { status: typeof ran.status === 'number' ? ran.status : 200 });
  }
  const reason = typeof result.reason === 'string' ? result.reason : 'policy_block';
  const detail = 'message' in result && typeof result.message === 'string' ? result.message : '';
  const message = detail || `"${operation.id}" was refused: ${reason}.`;
  throw json403({ error: true, status: 403, code: reason, operation: operation.id, action: operation.action, message }, message);
}

/**
 * "Ask": hand the request to the connector gateway as a `kortix` call. The
 * gateway decides it again with the same rules, holds it, posts the approval
 * card and answers with the execution id; after approval it runs the call
 * once, as this caller, and resumes the session.
 */
async function askThroughGateway(c: Context, operation: Operation, routePath: string): Promise<Response> {
  // Loaded on the ask path only: auth stays free of the connector stack.
  const [{ resolvePrincipal }, { makeDbGatewayDeps }, { handleCall }, { callPolicySetOf }, { withKortixConnector }] =
    await Promise.all([
      import('../connectors/http-principal'),
      import('../connectors/db-deps-gateway'),
      import('../connectors/gateway'),
      import('../connectors/principal-access'),
      import('../connectors/kortix-agent/ensure'),
    ]);
  const principal = await resolvePrincipal(c);
  if (!principal) {
    const message = `"${operation.id}" needs a person to approve it, and this caller cannot hold a call.`;
    throw json403({ error: true, status: 403, code: 'approval_required', operation: operation.id, message }, message);
  }
  const args = await toolArgs(c, routePath, operation);
  const call = () =>
    handleCall(makeDbGatewayDeps(principal), {
      projectId: principal.projectId,
      accountId: principal.accountId,
      subject: principal.subject,
      sessionId: principal.sessionId,
      actingTokenId: principal.tokenId ?? null,
      connectorSlug: KORTIX_CONNECTOR_SLUG,
      actionPath: operation.id,
      args,
      approvalExecutionId: null,
      approvalContext: c.req.header(APPROVAL_CONTEXT_HEADER) ?? null,
      policySet: callPolicySetOf(principal, KORTIX_CONNECTOR_SLUG),
    });
  return gatewayAnswer(operation, await withKortixConnector(principal.projectId, principal.accountId, KORTIX_CONNECTOR_SLUG, call));
}

/** Decide the request: nothing for allow, a Response for ask, a thrown 403 for block. */
export async function gateAgentOperation(c: Context): Promise<Response | undefined> {
  if (!isAgentSessionRequest(c)) return undefined;
  const matched = requestOperation(c);
  if (!matched) return undefined;
  const { operation, path } = matched;
  const projectId = (c.get('tokenProjectId') as string | undefined) ?? null;
  const [stored, trust] = await Promise.all([
    projectId ? loadProjectPoliciesFor(projectId) : Promise.resolve([] as Policy[]),
    sessionTrust(c.get('sessionId') as string),
  ]);
  const projectPolicies = stored.filter(isKortixPolicy);
  const conditional = projectPolicies.some((p) => (p.conditions?.length ?? 0) > 0 || p.conditionsInvalid);
  const decision = decideKortixOperation({
    operation,
    grant: getAgentGrant(c),
    projectPolicies,
    trust,
    ...(conditional ? { args: await requestArgs(c, path), argsAvailable: true } : {}),
  });
  c.set('operation', operation);
  if (decision.action === 'always_run') return undefined;
  if (decision.action === 'require_approval') return askThroughGateway(c, operation, path);
  throw refusal(operation, decision);
}
