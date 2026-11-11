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
 * exactly, after upper-casing; `AWS_` and `AZURE_` are matched as prefixes
 * because both vendors sign requests for hundreds of service hosts.
 */
const MULTI_USE_CREDENTIAL_NAMES: ReadonlySet<string> = new Set([
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITLAB_TOKEN',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'HF_TOKEN',
  'HUGGINGFACE_API_KEY',
  'HUGGING_FACE_HUB_TOKEN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_KEY',
]);
const MULTI_USE_CREDENTIAL_PREFIXES: readonly string[] = ['AWS_', 'AZURE_'];

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
 * Empty when the name is unknown or multi-use. The first catalog provider that
 * declares the name wins, matching the dialog's existing recognition order.
 */
export function knownSecretApiHosts(
  name: string,
  catalog: Iterable<SecretApiHostCatalogEntry> = [],
): string[] {
  const key = name.trim().toUpperCase();
  if (!key || isMultiUseCredentialName(key)) return [];
  for (const entry of catalog) {
    if (!entry.envVars.some((envVar) => envVar.toUpperCase() === key)) continue;
    const host = entry.apiHost ?? WELL_KNOWN_PROVIDER_API_HOSTS[entry.id] ?? null;
    return host ? [host.toLowerCase()] : [];
  }
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
