/**
 * What a repository's kortix.yaml (with its imports) needs before it runs:
 * the secret names it references, the webhook triggers GitHub must call, the
 * sandbox templates to build, the connectors to connect, and whether Slack is
 * used. `kortix onboard` makes these real; `kortix doctor --loops` checks them.
 * Pure: reads the merged document and the files it points at, never a value.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { declaredTemplateSlugs } from '../commands/sandboxes-build.ts';
import { envSpecFromManifest } from '../manifest.ts';

export type SecretSource = 'env.required' | 'env.optional' | `agent:${string}` | `trigger:${string}`;

export interface NeededSecret {
  name: string;
  /** Every place the manifest names it. */
  sources: SecretSource[];
  /** False only when every source is optional (`env.optional`, a disabled trigger). */
  required: boolean;
  /** A webhook trigger verifies its calls with it: Kortix may generate the value. */
  webhook: boolean;
}

export interface GitHubWebhookTrigger {
  slug: string;
  events: string[];
  /** The trigger's `on.webhook.secret`, or null when the trigger has none. */
  secret: string | null;
  enabled: boolean;
  /** `filter: body.label.name: <label>`: the repository label that starts the trigger. */
  label: string | null;
}

export interface DeclaredConnector {
  slug: string;
  provider: string;
}

export interface ManifestNeeds {
  secrets: NeededSecret[];
  triggers: Array<{ slug: string; enabled: boolean; webhook: boolean }>;
  github_webhooks: GitHubWebhookTrigger[];
  sandbox_templates: string[];
  sandbox_default: string | null;
  connectors: DeclaredConnector[];
  /** A connector, an agent grant or a prompt names Slack (`kortix_slack`, `provider: channel, platform: slack`). */
  uses_slack: boolean;
}

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

function isRow(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** `headers.github_event: issues` or `{ in: [a, b] }`, flat or nested under `headers`. */
export function githubEventsOfFilter(filter: unknown): string[] {
  if (!isRow(filter)) return [];
  const headers = isRow(filter.headers) ? filter.headers : {};
  const value = filter['headers.github_event'] ?? headers.github_event;
  if (typeof value === 'string') return [value];
  if (isRow(value)) return stringList(value.in ?? value.any_of);
  return stringList(value);
}

/** Text of every file under the import paths and every agent prompt_file (UTF-8, under 512 KiB each). */
function referencedText(root: string, data: Record<string, unknown>): string {
  const paths = new Set<string>(stringList(data.imports));
  for (const agent of Object.values(isRow(data.agents) ? data.agents : {})) {
    if (isRow(agent) && typeof agent.prompt_file === 'string') paths.add(agent.prompt_file);
  }
  let text = '';
  const read = (abs: string) => {
    const info = statSync(abs);
    if (info.isDirectory()) {
      for (const entry of readdirSync(abs)) if (entry !== 'node_modules' && entry !== '.git') read(join(abs, entry));
    } else if (info.size < 512 * 1024) {
      text += readFileSync(abs, 'utf8');
    }
  };
  for (const path of paths) {
    const abs = resolve(root, path);
    if (abs.startsWith(resolve(root)) && existsSync(abs)) read(abs);
  }
  return text;
}

/** Read the needs from the merged manifest document rooted at `root`. */
export function manifestNeeds(data: Record<string, unknown>, root: string): ManifestNeeds {
  const secrets = new Map<string, NeededSecret>();
  const add = (name: string, source: SecretSource, required: boolean, webhook = false) => {
    const key = name.trim().toUpperCase();
    if (!ENV_NAME.test(key)) return;
    const row = secrets.get(key) ?? { name: key, sources: [], required: false, webhook: false };
    if (!row.sources.includes(source)) row.sources.push(source);
    row.required ||= required;
    row.webhook ||= webhook;
    secrets.set(key, row);
  };

  const env = envSpecFromManifest(data);
  for (const name of env.required) add(name, 'env.required', true);
  for (const name of env.optional) add(name, 'env.optional', false);

  const agents = isRow(data.agents) ? data.agents : {};
  let slackGrant = false;
  for (const [name, agent] of Object.entries(agents)) {
    if (!isRow(agent)) continue;
    for (const secret of stringList(agent.secrets)) add(secret, `agent:${name}`, true);
    if ([...stringList(agent.connectors), ...stringList(agent.connectors_required)].includes('kortix_slack')) slackGrant = true;
  }

  const triggers: ManifestNeeds['triggers'] = [];
  const github: GitHubWebhookTrigger[] = [];
  for (const trigger of Array.isArray(data.triggers) ? data.triggers : []) {
    if (!isRow(trigger) || typeof trigger.slug !== 'string') continue;
    const enabled = trigger.enabled !== false;
    const on = isRow(trigger.on) ? trigger.on : {};
    const webhook = on.webhook !== undefined;
    triggers.push({ slug: trigger.slug, enabled, webhook });
    if (!webhook) continue;
    const secret = isRow(on.webhook) && typeof on.webhook.secret === 'string' ? on.webhook.secret.trim().toUpperCase() : null;
    if (secret) add(secret, `trigger:${trigger.slug}`, enabled, true);
    const events = githubEventsOfFilter(trigger.filter);
    const filter = isRow(trigger.filter) ? trigger.filter : {};
    const label = typeof filter['body.label.name'] === 'string' ? filter['body.label.name'] : null;
    if (events.length > 0) github.push({ slug: trigger.slug, events, secret, enabled, label });
  }

  const connectors: DeclaredConnector[] = [];
  let slackConnector = false;
  for (const entry of Array.isArray(data.connectors) ? data.connectors : []) {
    if (!isRow(entry) || typeof entry.slug !== 'string') continue;
    const provider = typeof entry.provider === 'string' ? entry.provider.toLowerCase() : '';
    const platform = typeof entry.platform === 'string' ? entry.platform.toLowerCase() : '';
    if (provider === 'channel') {
      if (platform === 'slack') slackConnector = true;
      continue; // a channel connector is connected with `kortix channels connect`, not the connector flow
    }
    connectors.push({ slug: entry.slug, provider });
  }

  const sandbox = isRow(data.sandbox) ? data.sandbox : {};
  const usesSlack = slackGrant || slackConnector || /\bkortix_slack\b/.test(referencedText(root, data));
  return {
    secrets: [...secrets.values()].sort((a, b) => a.name.localeCompare(b.name)),
    triggers,
    github_webhooks: github,
    sandbox_templates: declaredTemplateSlugs(data),
    sandbox_default: typeof sandbox.default === 'string' ? sandbox.default : null,
    connectors,
    uses_slack: usesSlack,
  };
}
