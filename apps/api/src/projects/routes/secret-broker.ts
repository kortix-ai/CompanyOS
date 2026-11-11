import {
  SecretBrokerRequestSchema,
  SecretBrokerResponseSchema,
} from '@kortix/api-contract';
import { createRoute, z } from '@hono/zod-openapi';
import { getAgentGrant } from '../../iam/agent-scope';
import { auth, errors, json } from '../../openapi';
import type { Context } from 'hono';
import {
  REFUSED_HEADER,
  RELAY_METHODS,
  type RelayRefusalReason,
} from '@kortix/api-contract/secret-relay';
import { executeSecretBrokerRequest, SecretBrokerError } from '../../secrets/http-broker';
import { refusalReasonFor } from '../../secrets/broker/errors';
import {
  classifyPresentedHandles,
  presentedHandleRefusalReason,
  requestSurfaceText,
  summarizeHandleRefusals,
} from '../../secrets/handle-substitution';
import { authorizeSecretRelay } from '../../secrets/relay-authorize';
import { recordAuditEvent } from '../../shared/audit';
import { config } from '../../config';
import { loadProjectForUser } from '../lib/access';
import {
  requestEgressIp,
  verifySandboxEgressIp,
} from '../../platform/services/sandbox-egress-pin';
import { projectsApp } from '../lib/app';
import { readJsonObject } from '../../shared/http-body';
import { workspaceIdParam } from '../../shared/route-params';

/**
 * The buffered route's error envelope: the legacy body `{ error, code }`,
 * unchanged, plus `x-kortix-refused` when Kortix refused. Status codes and
 * codes are unchanged for deployed daemons.
 */
function brokerError(
  c: Context,
  code: string,
  message: string,
  status: number,
  refused?: RelayRefusalReason | null,
): BrokerErrorResponse {
  const reason = refusalReasonFor(code, status, refused);
  if (reason) c.header(REFUSED_HEADER, reason);
  // Cast: the typed route handler accepts only its declared response shapes,
  // and the error shapes it declares (`errors(...)`) are exactly this one.
  return c.json(
    { error: message, code },
    status as 400 | 403 | 404 | 409 | 413 | 502 | 504,
  ) as unknown as BrokerErrorResponse;
}

/** The typed-route stand-in for an error response; see `brokerError`. */
type BrokerErrorResponse = never;

export function registerSecretBrokerRoutes(): void {
  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/secrets/{identifier}/broker',
      tags: ['secrets'],
      summary: 'Send one policy-bound HTTPS request without exposing the secret',
      ...auth,
      request: {
        params: z.object({ workspaceId: z.string(), identifier: z.string() }),
        body: { content: { 'application/json': { schema: SecretBrokerRequestSchema } } },
      },
      responses: {
        200: json(SecretBrokerResponseSchema, 'Upstream response'),
        ...errors(400, 403, 404, 409, 413, 502, 504),
      },
    }),
    async (c) => {
      const projectId = workspaceIdParam(c);
      const identifier = c.req.param('identifier')?.trim();
      const rawBody = await readJsonObject(c);
      const parsed = SecretBrokerRequestSchema.safeParse(rawBody);
      if (!identifier || !parsed.success) {
        // TRACE (and any method outside the schema) stays refused, tagged: TRACE
        // echoes the request, credential headers included, back to the caller.
        const method = typeof rawBody.method === 'string' ? rawBody.method.toUpperCase() : undefined;
        const badMethod =
          method !== undefined && !(RELAY_METHODS as readonly string[]).includes(method);
        return brokerError(
          c,
          'invalid_request',
          'Invalid broker request',
          400,
          badMethod ? 'credential_method' : undefined,
        );
      }

      const agentGrant = getAgentGrant(c);
      const sessionId = c.get('sessionId');
      if (
        c.get('authType') !== 'pat' ||
        c.get('tokenProjectId') !== projectId ||
        !sessionId ||
        !agentGrant
      ) {
        return brokerError(
          c,
          'session_agent_token_required',
          'Secret broker requests require a session-scoped agent token',
          403,
        );
      }

      // Is this request coming from the sandbox the session token was issued to?
      //
      // The token lives in the agent's own shell env (it needs it for the CLI and
      // git), so the agent can copy it out. Everything else on this route checks
      // what the token IS; this checks where it is being used FROM. Unpinned
      // sessions pass — see sandbox-egress-pin.ts on why that direction is the
      // safe one.
      const pin = await verifySandboxEgressIp(sessionId, requestEgressIp(c));
      if (!pin.ok) {
        // Logged whether or not it blocks, so log-only mode still surfaces the
        // event — a kill switch that also silences the evidence is useless.
        console.warn('[secret-broker] refused an off-sandbox token use', {
          sessionId,
          projectId,
          pinned: pin.pinned,
          seen: pin.seen,
          enforced: config.KORTIX_SANDBOX_EGRESS_PIN_ENFORCED,
        });
      }
      if (!pin.ok && config.KORTIX_SANDBOX_EGRESS_PIN_ENFORCED) {
        return brokerError(
          c,
          'sandbox_egress_mismatch',
          'This session credential may only be used from its own sandbox',
          403,
        );
      }

      const loaded = await loadProjectForUser(c, projectId, 'read');
      if (!loaded) return c.json({ error: 'Not found' }, 404);

      let destination: URL;
      try {
        destination = new URL(parsed.data.url);
      } catch {
        return brokerError(c, 'invalid_request', 'Invalid broker URL', 400);
      }
      const shape = {
        host: destination.hostname,
        method: parsed.data.method,
        path: destination.pathname,
      };

      // ONE authorization decision, shared with the streaming relay and the
      // websocket transports (`secrets/relay-authorize.ts`). Everything this
      // route used to inline — the active-session query, the shared/personal
      // secret resolution, the delivery mode, the broker-or-boundary shape, the
      // live handle rows, the handle policy check, and the spendable set — lives
      // there now. Nothing about the wire changed: the same codes, the same
      // statuses, the same audit actions.
      const authz = await authorizeSecretRelay({
        projectId,
        identifier,
        userId: loaded.userId,
        accountId: loaded.row.accountId,
        sessionId,
        agentGrantEnv: agentGrant.env ?? 'all',
        shape,
      });

      // `audit === null` marks the two refusals that happen before the secret row
      // is known, which record no audit row — preserved exactly.
      const auditContext = authz.audit;
      if (!auditContext) {
        if (authz.ok) throw new Error('unreachable: an authorized relay always has an audit context');
        if (authz.code === 'secret_not_found') {
          c.header(REFUSED_HEADER, 'policy_denied');
          return c.json({ error: authz.message }, 404);
        }
        return brokerError(c, authz.code, authz.message, 403);
      }

      const auditBase = {
        accountId: loaded.row.accountId,
        projectId,
        sessionId,
        actorUserId: loaded.userId,
        actorType: 'agent' as const,
        source: 'agent',
        resourceType: 'project_secret',
        resourceId: auditContext.secretId,
        metadata: {
          identifier,
          // Derived, not hardcoded: this route now serves the network boundary as
          // well as the HTTP broker, and an audit row that calls every boundary
          // relay `http_broker` would misattribute the delivery mode in the one
          // record anybody reviews after an incident.
          consumer: auditContext.strategy === 'egress' ? 'network' : 'http_broker',
          strategy: auditContext.strategy,
          host: destination.hostname,
          method: parsed.data.method,
          path: destination.pathname,
        },
      };

      if (!authz.ok) {
        await recordAuditEvent({
          ...auditBase,
          action: 'secret.broker.failed',
          outcome: authz.status === 403 || authz.status === 409 ? 'denied' : 'failure',
          httpStatus: authz.status,
          after: { reason: authz.code },
        });
        return brokerError(c, authz.code, authz.message, authz.status);
      }

      try {
        await recordAuditEvent({
          ...auditBase,
          action: 'secret.broker.requested',
          outcome: 'pending',
        });

        const requestBody = parsed.data.body_base64
          ? Buffer.from(parsed.data.body_base64, 'base64')
          : null;
        const spendable = { substitutions: authz.substitutions, facts: authz.facts };

        // Evidence first, on the request as the guest sent it: once substitution
        // has run, an honored handle is gone from the bytes and a refused one is
        // indistinguishable from text that was never a handle.
        const refusals = classifyPresentedHandles(
          requestSurfaceText({
            url: parsed.data.url,
            headers: parsed.data.headers,
            body: requestBody,
          }),
          spendable.facts,
          config.API_KEY_SECRET,
        );
        if (refusals.length > 0) {
          await recordAuditEvent({
            ...auditBase,
            action: 'secret.handle.refused',
            outcome: 'denied',
            after: {
              refusals: summarizeHandleRefusals(refusals),
              detail: refusals,
            },
          });
          // The request does not leave. See `presentedHandleRefusalReason`.
          throw new SecretBrokerError(
            'policy_denied',
            'the request carries a secret handle this session may not spend on this destination; it was not sent',
            403,
            presentedHandleRefusalReason(refusals)!,
          );
        }

        const applied = new Set<string>();
        const result = await executeSecretBrokerRequest(authz.policy, authz.secret, parsed.data, {
          substitutions: spendable.substitutions,
          applied,
          secretHandle: authz.secretHandle,
        });
        await recordAuditEvent({
          ...auditBase,
          action: 'secret.broker.completed',
          outcome: result.status >= 400 ? 'failure' : 'success',
          after: {
            upstream_status: result.status,
            ...(applied.size > 0 ? { substituted: [...applied].sort() } : {}),
            ...(refusals.length > 0 ? { handle_refusals: summarizeHandleRefusals(refusals) } : {}),
          },
        });
        return c.json(result, 200);
      } catch (error) {
        const failure =
          error instanceof SecretBrokerError
            ? error
            : new SecretBrokerError('upstream_failed', 'Secret broker request failed', 502);
        await recordAuditEvent({
          ...auditBase,
          action: 'secret.broker.failed',
          outcome: failure.status === 403 ? 'denied' : 'failure',
          httpStatus: failure.status,
          after: {
            reason: failure.code,
            ...(refusalReasonFor(failure.code, failure.status, failure.refused) && {
              refused: refusalReasonFor(failure.code, failure.status, failure.refused),
            }),
          },
        });
        return brokerError(c, failure.code, failure.message, failure.status, failure.refused);
      }
    },
  );
}
