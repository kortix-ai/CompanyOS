// POST /v1/cli/setup-events: the milestones of a guided setup (/setup.md), as
// the CLI reaches them. The API checks each one against a closed list and
// sends it to PostHog as the person behind the credential
// (shared/product-analytics.ts). Nothing is stored here.
//
// - A person only: a browser sign-in or a personal CLI token outside a Kortix
//   session. An agent's session token, an API key, a service account or an
//   OAuth app gets `202 {accepted: false}`: automation is not a setup.
// - Telemetry never fails the CLI: a refused event is still `202`, only a
//   malformed body is `400`. The CLI sends with a short timeout and ignores
//   the answer.
// - Rate limited per user (createSetupEventRateLimitMiddleware): a setup run
//   sends about ten events, and every one counts against the PostHog plan.
import { createRoute, z } from '@hono/zod-openapi';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { auth, errors, json, makeOpenApiApp } from '../openapi';
import { supabaseAuth } from '../middleware/auth';
import { analyticsSource } from '../middleware/analytics-source';
import { callerKortixSessionId } from '../middleware/caller-session';
import { createSetupEventRateLimitMiddleware } from '../middleware/rate-limit';
import {
  captureProductEvent,
  type ProductEvent,
  type ProductEventProperties,
} from '../shared/product-analytics';

/** The coding agents the CLI recognizes from their environment variables. */
export const SETUP_AGENTS = [
  'claude_code',
  'codex',
  'cursor',
  'gemini',
  'opencode',
  'copilot',
  'kortix',
  'other',
  'none',
] as const;

/** How each phase of `kortix onboard` (apps/cli/src/onboarding/phases.ts) ended. */
const PHASE_STATUSES = ['done', 'skipped', 'waiting_on_person', 'failed'] as const;

const count = z.number().int().min(0).max(10_000);

/** Each phase the run reached, with its status. A run that stopped early names fewer phases. */
const phase = z.enum(PHASE_STATUSES).optional();
const PhasesSchema = z
  .object({ validate: phase, ship: phase, secrets: phase, webhooks: phase, slack: phase, connectors: phase, sandbox: phase, doctor: phase })
  .strict();

const Common = {
  /** One guided setup: the CLI keeps it for 24 hours after the last event. */
  setup_id: z.string().uuid(),
  agent: z.enum(SETUP_AGENTS),
  cli_version: z.string().regex(/^[0-9A-Za-z.+-]{1,40}$/),
};

const SetupEventBodySchema = z
  .discriminatedUnion('event', [
    z
      .object({
        event: z.literal('setup_started'),
        ...Common,
        properties: z.object({ has_workspace: z.boolean(), has_manifest: z.boolean() }).strict(),
      })
      .strict(),
    z
      .object({
        event: z.literal('setup_template_added'),
        ...Common,
        properties: z.object({ template: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/) }).strict(),
      })
      .strict(),
    z
      .object({
        event: z.literal('setup_onboard_run'),
        ...Common,
        properties: z
          .object({
            project_id: z.string().uuid().nullable(),
            exit_code: z.number().int().min(0).max(255),
            wait: z.boolean(),
            waited_s: count,
            duration_s: count,
            steps_left: count,
            connectors: count,
            secrets: count,
            sandbox_templates: count,
            slack: z.boolean(),
            phases: PhasesSchema,
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        event: z.literal('setup_ready'),
        ...Common,
        properties: z
          .object({
            project_id: z.string().uuid().nullable(),
            via: z.enum(['onboard', 'doctor']),
            minutes_since_start: z.number().min(0).max(100_000),
          })
          .strict(),
      })
      .strict(),
  ])
  .openapi('SetupEventBody');

export type SetupEventBody = z.infer<typeof SetupEventBodySchema>;

const SetupEventReceiptSchema = z
  .object({ accepted: z.boolean().openapi({ description: 'False when the caller is not a person: nothing was sent.' }) })
  .openapi('SetupEventReceipt');

/** The person behind the request, or null for automation. */
function personOf(c: Context): string | null {
  const authType = c.get('authType') as string | undefined;
  if (authType !== 'supabase' && authType !== 'pat') return null;
  if (callerKortixSessionId(c)) return null;
  return (c.get('userId') as string | undefined) ?? null;
}

/** One PostHog event per setup run for a milestone that a retry may repeat. */
function dedupeKeyOf(body: SetupEventBody): string | undefined {
  if (body.event === 'setup_started' || body.event === 'setup_ready') return body.setup_id;
  if (body.event === 'setup_template_added') return `${body.setup_id}:${body.properties.template}`;
  return undefined;
}

/** The flat PostHog properties: an onboard run's phases become `phase_<name>`. */
export function setupEventProperties(body: SetupEventBody): ProductEventProperties {
  const common = { setup_id: body.setup_id, agent: body.agent, cli_version: body.cli_version };
  if (body.event !== 'setup_onboard_run') return { ...common, ...body.properties };
  const { phases, ...rest } = body.properties;
  const flat: ProductEventProperties = { ...common, ...rest };
  for (const [name, status] of Object.entries(phases)) if (status) flat[`phase_${name}`] = status;
  return flat;
}

export interface CliSetupEventsDeps {
  authMiddleware?: MiddlewareHandler;
  rateLimitMiddleware?: MiddlewareHandler;
  capture?: typeof captureProductEvent;
}

export function createCliSetupEventsApp(deps: CliSetupEventsDeps = {}) {
  const capture = deps.capture ?? captureProductEvent;
  const app = makeOpenApiApp<AppEnv>();
  app.use('*', deps.authMiddleware ?? supabaseAuth);
  app.use('*', deps.rateLimitMiddleware ?? createSetupEventRateLimitMiddleware());

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags: ['cli'],
      summary: 'Report a guided-setup milestone from the CLI',
      description:
        'One milestone of a /setup.md run (setup_started, setup_template_added, setup_onboard_run, setup_ready), ' +
        'sent to product analytics as the person behind the credential. Nothing is stored. ' +
        'Automation (a session token, an API key, a service account, an OAuth app) is answered `accepted: false`.',
      ...auth,
      request: {
        body: { required: true, content: { 'application/json': { schema: SetupEventBodySchema } } },
      },
      responses: {
        202: json(SetupEventReceiptSchema, 'Accepted'),
        ...errors(400, 401, 429),
      },
    }),
    async (c) => {
      const body = c.req.valid('json') as SetupEventBody;
      const userId = personOf(c);
      if (!userId) return c.json({ accepted: false }, 202);
      capture({
        userId,
        accountId: (c.get('accountId') as string | undefined) ?? undefined,
        event: body.event satisfies ProductEvent,
        dedupeKey: dedupeKeyOf(body),
        properties: { ...setupEventProperties(body), source: analyticsSource(c) },
      });
      return c.json({ accepted: true }, 202);
    },
  );

  return app;
}
