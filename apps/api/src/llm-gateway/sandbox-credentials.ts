import { primaryAuthEnvVars, providerAuthRequirement } from '@kortix/llm-catalog';
import { knownSecretApiHosts, type SecretApiHostCatalogEntry } from '@kortix/shared/secret-api-hosts';
import { runtimeModelCatalog } from './models/runtime-catalog';

// Provider API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, …). The gateway is the
// only LLM path, so these are withheld from the runtime process (the daemon
// enforces this). CODEX_AUTH_JSON is gateway-only.
let cachedRevision = -1;
let cachedProviderEnv = new Set<string>();

function providerCredentialEnv(): Set<string> {
  const revision = runtimeModelCatalog.status().revision;
  if (revision === cachedRevision) return cachedProviderEnv;
  const names = new Set<string>();
  for (const provider of runtimeModelCatalog.snapshot().providers) {
    for (const envVar of [...(provider.env ?? []), ...primaryAuthEnvVars(provider)]) names.add(envVar);
  }
  cachedProviderEnv = names;
  cachedRevision = revision;
  return cachedProviderEnv;
}

function isManagedEnv(name: string): boolean {
  return name === 'CODEX_AUTH_JSON' || providerCredentialEnv().has(name);
}

export function isGatewayManagedEnv(name: string): boolean {
  return isManagedEnv(name);
}

let cachedHostRevision = -1;
let cachedHostCatalog: SecretApiHostCatalogEntry[] = [];

/** The runtime model catalog in the shape `knownSecretApiHosts` reads. */
function secretApiHostCatalog(): SecretApiHostCatalogEntry[] {
  const revision = runtimeModelCatalog.status().revision;
  if (revision === cachedHostRevision) return cachedHostCatalog;
  cachedHostCatalog = runtimeModelCatalog.snapshot().providers.map((provider) => {
    let apiHost: string | null = null;
    try {
      apiHost = provider.api ? new URL(provider.api).hostname.toLowerCase() || null : null;
    } catch {
      apiHost = null;
    }
    return {
      id: provider.id,
      apiHost,
      envVars: providerAuthRequirement(provider).methods.flatMap((method) => method.envVars),
    };
  });
  cachedHostRevision = revision;
  return cachedHostCatalog;
}

/**
 * The API hosts a secret of this name is spent on, from the same table the
 * secrets dialog prefills (`@kortix/shared/secret-api-hosts`) over the live
 * runtime catalog. Empty for an unknown or multi-use name.
 */
export function secretApiHostsForName(name: string): string[] {
  return knownSecretApiHosts(name, secretApiHostCatalog());
}
