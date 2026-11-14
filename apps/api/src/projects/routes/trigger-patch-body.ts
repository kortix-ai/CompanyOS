import { z } from '@hono/zod-openapi';

/**
 * The trigger PATCH body vocabulary: every key once, with the groups it belongs to.
 * `manifest`: touches the committed repo manifest (a PATCH of none of these has
 * nothing to commit, so we skip git entirely and treat it as a no-op).
 * `typeSpecific`: owned by one trigger type, dropped when a PATCH changes the type.
 * `event`: changes which event a trigger subscribes to.
 * `undocumented`: accepted but not in the documented schema (spelling aliases and
 * monitor fields).
 */
const TRIGGER_BODY_KEYS = {
  app: ['manifest', 'typeSpecific'],
  target: ['manifest'],
  name: ['manifest'],
  type: ['manifest'],
  agent: ['manifest'],
  model: ['manifest'],
  enabled: ['manifest'],
  prompt_template: ['manifest'],
  promptTemplate: ['manifest', 'undocumented'],
  cron: ['manifest', 'typeSpecific'],
  every: ['manifest', 'typeSpecific'],
  schedule: ['manifest'],
  run_at: ['manifest', 'typeSpecific'],
  runAt: ['manifest', 'undocumented'],
  timezone: ['manifest', 'typeSpecific'],
  secret_env: ['manifest', 'typeSpecific'],
  secretEnv: ['manifest', 'undocumented'],
  session_mode: ['manifest'],
  sessionMode: ['manifest', 'undocumented'],
  session_id: ['manifest'],
  sessionId: ['manifest', 'undocumented'],
  session_key: ['manifest'],
  sessionKey: ['manifest', 'undocumented'],
  filter: ['manifest'],
  // A PATCH of only these must still write the manifest (KRTX-1721, KRTX-1743).
  max_runs_per_hour: ['manifest'],
  max_runs_per_day: ['manifest'],
  max_lateness: ['manifest'],
  expect_event_within: ['manifest', 'typeSpecific'],
  overlap: ['manifest'],
  connector: ['manifest', 'typeSpecific', 'event'],
  event_account: ['manifest', 'typeSpecific', 'event'],
  event_source: ['manifest', 'typeSpecific', 'event'],
  event: ['manifest', 'typeSpecific', 'event'],
  event_config: ['manifest', 'typeSpecific', 'event'],
  run: ['typeSpecific', 'undocumented'],
  mode: ['typeSpecific', 'undocumented'],
  interval: ['typeSpecific', 'undocumented'],
  // Not manifest keys: they change the trigger's chat space, not its manifest entry.
  session_access: [],
  space_id: [],
} as const satisfies Record<string, readonly BodyGroup[]>;

type BodyGroup = 'manifest' | 'typeSpecific' | 'event' | 'undocumented';
type BodyKey = keyof typeof TRIGGER_BODY_KEYS;
type UndocumentedKey = {
  [K in BodyKey]: 'undocumented' extends (typeof TRIGGER_BODY_KEYS)[K][number] ? K : never;
}[BodyKey];
const keysInGroup = (group: BodyGroup): string[] =>
  Object.entries<readonly BodyGroup[]>(TRIGGER_BODY_KEYS)
    .filter(([, groups]) => groups.includes(group))
    .map(([key]) => key);

/** Body keys that change which event a trigger subscribes to. */
export const EVENT_BODY_KEYS = keysInGroup('event');

/** Merge-body keys owned by one trigger type, dropped when a PATCH changes the type. */
export const TYPE_SPECIFIC_BODY_KEYS = keysInGroup('typeSpecific');

/** Body keys that change the trigger's repo manifest (committed to git). */
export const TRIGGER_MANIFEST_KEYS = keysInGroup('manifest');

export const TRIGGER_PATCH_SHAPE = {
    name: z.string().optional().openapi({ description: 'New name.' }),
    type: z.enum(['cron', 'webhook', 'monitor', 'event', 'app']).optional().openapi({ description: 'New trigger type. Changing it drops the fields that belong to the old type.' }),
    prompt_template: z.string().optional().openapi({ description: 'New prompt.' }),
    agent: z.string().optional().openapi({ description: 'Agent to run.' }),
    model: z.string().optional().openapi({ description: 'Model as provider/model.' }),
    enabled: z.boolean().optional().openapi({ description: 'Turn the trigger on or off.' }),
    cron: z.string().optional().openapi({ description: 'Cron expression.' }),
    schedule: z.string().optional().openapi({ description: 'Alias of cron.' }),
    run_at: z.string().optional().openapi({ description: 'ISO-8601 instant for a one-off trigger.' }),
    every: z.string().nullish().openapi({ description: 'A fixed period such as 5m, 1h or 1d (at least 1m), instead of cron or run_at. Cron triggers only.' }),
    timezone: z.string().optional().openapi({ description: 'IANA timezone.' }),
    secret_env: z.string().optional().openapi({ description: 'Webhook signing secret name.' }),
    connector: z.string().optional().openapi({ description: 'Connector slug of an event trigger.' }),
    event_account: z.string().nullish().openapi({ description: 'Label of one shared account of the connector; null clears it to the connector default.' }),
    event_source: z.string().nullish().openapi({ description: 'Event source adapter id of an event trigger; null clears it to the connector provider.' }),
    event: z.string().optional().openapi({ description: 'The adapter event type id of an event trigger.' }),
    event_config: z.record(z.string(), z.any()).optional().openapi({ description: 'Provider event config of an event trigger.' }),
    app: z.string().optional().openapi({ description: 'App slug of an app trigger.' }),
    target: z.object({ app: z.string(), path: z.string().optional(), method: z.enum(['POST', 'GET']).optional(), payload: z.record(z.string(), z.any()).optional() }).nullish().openapi({ description: 'Call an App instead of running an agent: each fire wakes the App and sends the payload to method path (default POST /). null clears it.' }),
    session_mode: z.enum(['fresh', 'reuse', 'pinned', 'keyed']).optional().openapi({ description: 'Session reuse mode.' }),
    session_id: z.string().optional().openapi({ description: 'Session to pin.' }),
    session_key: z.string().optional().openapi({ description: 'Session key template.' }),
    filter: z.record(z.string(), z.any()).optional().openapi({ description: 'Payload filter: path to a value (equals) or one operator (not, in, exists, prefix, not_prefix). null or {} clears it.' }),
    max_lateness: z.string().nullish().openapi({ description: 'Cron triggers only: the misfire bound, such as 10m (at least 1m); a slot later than this is skipped. null removes it.' }),
    expect_event_within: z.string().nullish().openapi({ description: 'App triggers only: the silence alert, such as 30m; null removes it.' }),
    max_runs_per_hour: z.number().int().min(1).nullish().openapi({ description: 'Runs per 60 minutes; null resets it to the default, 60.' }),
    max_runs_per_day: z.number().int().min(1).nullish().openapi({ description: 'Runs per UTC day; null removes the daily cap.' }),
    overlap: z.enum(['skip', 'allow']).nullish().openapi({ description: 'skip or allow; null resets it to the default (skip for cron, allow otherwise).' }),
    session_access: z.object({ mode: z.enum(['private', 'members', 'project']), memberIds: z.array(z.string()).optional(), groupIds: z.array(z.string()).optional() }).optional().optional().openapi({ description: 'Who can see the sessions this trigger creates.' }),
    space_id: z.string().nullish().openapi({ description: 'Channel or DM its runs post to; null clears it (chat flag; ignored while it is off). It applies to later runs only; moving to a channel without session_access makes later threads project-visible.' }),
};

/** `true` while the PATCH schema documents exactly the table's documented keys. */
type KeysMatch<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export const TRIGGER_PATCH_SHAPE_MATCHES_KEYS = true satisfies KeysMatch<
  keyof typeof TRIGGER_PATCH_SHAPE,
  Exclude<BodyKey, UndocumentedKey>
>;
