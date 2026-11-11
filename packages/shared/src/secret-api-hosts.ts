/**
 * Which API host a secret NAME belongs to — the one table the secrets dialog
 * prefills from and the API reads when it chooses a delivery for a new secret.
 *
 * Two sources, in this order:
 *
 *  1. The LLM provider catalog. Every env var any auth method of a provider
 *     declares maps to that provider's API host. The catalog is passed IN by
 *     the caller (the web app holds a live copy, the API its runtime catalog):
 *     this package has no dependency on the catalog package, and a baked copy
 *     here would be a second copy that drifts.
 *  2. Curated fallbacks. Some SDKs hardcode their base URL, so the catalog
 *     declares no API host for that provider (Anthropic and OpenAI among them).
 *     These are stable, documented constants, keyed by catalog provider id and,
 *     for the case with no catalog at all, by env var name.
 *
 * ## Names this table never answers for
 *
 * A name that tools OTHER than one model API also read is not a model key,
 * whatever the catalog says. `GITHUB_TOKEN` is the incident that taught this:
 * the catalog maps it to a coding-assistant provider, and a project's own
 * GitHub token was classified as a model credential and withheld from the
 * sandbox (2026-08-27). Pinning such a name to one host would break every other
 * use of it, so `knownSecretApiHosts` returns `[]` for it.
 */

/** The catalog fields this module reads. */
export interface SecretApiHostCatalogEntry {
  /** Catalog provider id, e.g. `anthropic`. */
  id: string;
  /** Lowercased host of the provider's API base URL. Null when the catalog declares none. */
  apiHost: string | null;
  /** Every env var any auth method of this provider declares. */
  envVars: readonly string[];
}

/** Curated API hosts for providers whose SDK hardcodes the base URL. Keyed by catalog provider id. */
export const WELL_KNOWN_PROVIDER_API_HOSTS: Readonly<Record<string, string>> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  google: 'generativelanguage.googleapis.com',
};

/**
 * The same fallbacks keyed by env var name, for a caller with no catalog. Only
 * names that one model API reads and nothing else.
 */
const CURATED_NAME_HOSTS: Readonly<Record<string, string>> = {
  ANTHROPIC_API_KEY: 'api.anthropic.com',
  OPENAI_API_KEY: 'api.openai.com',
  GEMINI_API_KEY: 'generativelanguage.googleapis.com',
  GOOGLE_GENERATIVE_AI_API_KEY: 'generativelanguage.googleapis.com',
};

/**
 * Names read by tools beyond one model API. See the module comment. Matched
 * exactly, after upper-casing. Reviewed against every env var the LLM catalog
 * declares (227 names, 2026-11-11). Excluding a name costs nothing: the secret
 * keeps the environment delivery. Including a wrong one breaks every other
 * tool that reads it. When in doubt, a name goes here.
 */
const MULTI_USE_CREDENTIAL_NAMES: ReadonlySet<string> = new Set([
  // The code host's CLI, git credential helpers and CI actions read it.
  'GITHUB_TOKEN',
  // The same code host's CLI reads it as an alias.
  'GH_TOKEN',
  // The other code host's CLI and API clients read it; the catalog maps it to a model.
  'GITLAB_TOKEN',
  // One key for every API of that vendor (maps, search, translate), not only the model API.
  'GOOGLE_API_KEY',
  // A path to a service-account file, signed inside the box: never a header value.
  'GOOGLE_APPLICATION_CREDENTIALS',
  // The model hub's CLI and libraries download weights and datasets with it.
  'HF_TOKEN',
  // Same model hub, older SDK name.
  'HUGGINGFACE_API_KEY',
  // Same model hub, the hub client's own name.
  'HUGGING_FACE_HUB_TOKEN',
  // The edge platform's CLI deploys and manages DNS with it.
  'CLOUDFLARE_API_TOKEN',
  // Same edge platform, global API key: every account API host.
  'CLOUDFLARE_API_KEY',
  // The data platform's CLI and SDK call the workspace API, a per-workspace host.
  'DATABRICKS_TOKEN',
  // The cloud's CLI and infrastructure tooling manage droplets with it.
  'DIGITALOCEAN_ACCESS_TOKEN',
  // A personal access token for the whole data warehouse account, per-account host.
  'SNOWFLAKE_CORTEX_PAT',
  // The cloud's CLI reads this exact name to manage instances.
  'VULTR_API_KEY',
  // A cloud account key: infrastructure APIs as well as model endpoints.
  'HETZNER_API_KEY',
  // A cloud account key: infrastructure APIs as well as model endpoints.
  'SCALEWAY_API_KEY',
  // A cloud account key: infrastructure APIs as well as model endpoints.
  'OVHCLOUD_API_KEY',
  // A cloud account key: infrastructure APIs as well as model endpoints.
  'STACKIT_API_KEY',
  // The experiment tracker's CLI and SDK log runs with it; inference is a side use.
  'WANDB_API_KEY',
  // One key for several model hosts of the same vendor (catalog lists one).
  'NVIDIA_API_KEY',
]);
/**
 * Prefixes read by tools beyond one model API: both vendors sign requests for
 * hundreds of service hosts with one credential (`AWS_ACCESS_KEY_ID`,
 * `AWS_BEARER_TOKEN_BEDROCK`, `AZURE_API_KEY`, ...).
 */
const MULTI_USE_CREDENTIAL_PREFIXES: readonly string[] = ['AWS_', 'AZURE_'];

/**
 * The catalog also lists configuration names beside credentials: a region, an
 * account id, a project id, a base URL (`AWS_REGION`, `CLOUDFLARE_ACCOUNT_ID`,
 * `GOOGLE_VERTEX_PROJECT`, `NEON_AI_GATEWAY_BASE_URL`). Their value is not a
 * secret and a client reads it as-is, so a handle in its place breaks the
 * client. Only a credential-shaped name maps to a host.
 */
const CREDENTIAL_NAME_SHAPE = /(?:KEY|TOKEN|PAT|SECRET)$/;

/**
 * A literal DNS name. The catalog writes templated base URLs
 * (`https://${ACCOUNT}.example.test/v1`); a URL parser accepts those and
 * returns a host no request ever reaches.
 */
const LITERAL_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** True when the name is read by tools beyond one model API. */
export function isMultiUseCredentialName(name: string): boolean {
  const key = name.trim().toUpperCase();
  return (
    MULTI_USE_CREDENTIAL_NAMES.has(key) ||
    MULTI_USE_CREDENTIAL_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/**
 * The API hosts a secret of this name is spent on, lowercased and sorted.
 *
 * Empty when the name is unknown, multi-use, or not credential-shaped. Every
 * catalog provider that declares the name contributes its host: one vendor
 * lists a regional twin per region (`.cn` beside `.ai`) under the same env
 * var, and the key works on each of them. A templated host contributes
 * nothing.
 */
export function knownSecretApiHosts(
  name: string,
  catalog: Iterable<SecretApiHostCatalogEntry> = [],
): string[] {
  const key = name.trim().toUpperCase();
  if (!key || !CREDENTIAL_NAME_SHAPE.test(key) || isMultiUseCredentialName(key)) return [];
  const hosts = new Set<string>();
  let declared = false;
  for (const entry of catalog) {
    if (!entry.envVars.some((envVar) => envVar.toUpperCase() === key)) continue;
    declared = true;
    const host = (entry.apiHost ?? WELL_KNOWN_PROVIDER_API_HOSTS[entry.id] ?? '').toLowerCase();
    if (LITERAL_HOST.test(host)) hosts.add(host);
  }
  if (declared) return [...hosts].sort();
  const curated = CURATED_NAME_HOSTS[key];
  return curated ? [curated] : [];
}

/**
 * AWS access-key ids. The prefix set is AWS's own documented list of unique id
 * prefixes; 16 uppercase alphanumerics follow, always.
 */
const AWS_ACCESS_KEY_ID = /^(?:AKIA|ASIA|ABIA|ACCA|A3T[A-Z0-9])[A-Z0-9]{16}$/;
/** PEM blocks: RSA/EC/OPENSSH private keys all carry this header. */
const PEM_PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/;
/** OpenSSH key material pasted without its PEM wrapper, and PuTTY's format. */
const SSH_KEY_MATERIAL = /^(?:ssh-rsa |ssh-ed25519 |ssh-dss |ecdsa-sha2-|PuTTY-User-Key-File)/;

/**
 * Does the VALUE look like signing material?
 *
 * Signing material is used to compute a signature inside the sandbox, so it
 * never travels in a request where a handle could be substituted. No host
 * table can make such a value work under network delivery.
 */
export function looksLikeSigningCredential(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    AWS_ACCESS_KEY_ID.test(trimmed) || PEM_PRIVATE_KEY.test(trimmed) || SSH_KEY_MATERIAL.test(trimmed)
  );
}
