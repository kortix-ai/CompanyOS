/**
 * An App exposes tools: `apps.<slug>.tools: <path>` names an OpenAPI 3
 * document inside the App's folder. Every manifest sync materializes it as
 * the connector `app-<slug>` (provider `app`): one project account, one
 * action per operation (`normalizeAppTools`), bound to the App itself. The
 * gateway then serves it like any connector: search / describe / call as
 * `connectors.app-<slug>.<operationId>`, the agent's `connectors:` grant,
 * policies, approvals and the call log.
 */
import { createHash } from 'node:crypto';
import { appToolsDocumentPath } from '@kortix/manifest-schema';
import type { ConnectorSpec } from '../projects/surface';

export const APP_CONNECTOR_PREFIX = 'app-';

/** The connector an App's tools materialize as. */
export function appConnectorSlug(app: string): string {
  return `${APP_CONNECTOR_PREFIX}${app}`;
}

const isRow = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The connector specs the `apps:` block declares, one per App with a valid
 * `tools` path. A declared `connectors:` entry under the same slug wins; the
 * App's tools are then reported as an error instead of shadowing it.
 */
export function appToolConnectorSpecs(
  appsNode: unknown,
  manifestPath: string,
  declaredSlugs: ReadonlySet<string>,
): { specs: ConnectorSpec[]; errors: Array<{ slug: string; error: string }> } {
  const specs: ConnectorSpec[] = [];
  const errors: Array<{ slug: string; error: string }> = [];
  if (!isRow(appsNode)) return { specs, errors };
  for (const [app, block] of Object.entries(appsNode)) {
    if (!isRow(block) || block.tools === undefined) continue;
    const slug = appConnectorSlug(app);
    const documentPath = appToolsDocumentPath(app, block);
    if (!documentPath) {
      errors.push({ slug, error: `apps.${app}.tools must be a .json, .yaml or .yml path inside the App's folder` });
      continue;
    }
    if (declaredSlugs.has(slug)) {
      errors.push({ slug, error: `apps.${app}.tools: the connector slug "${slug}" is taken by connectors.${slug}; rename that connector` });
      continue;
    }
    specs.push({
      slug,
      path: `${manifestPath}#apps.${app}.tools`,
      name: app,
      enabled: true,
      provider: 'app',
      credentialMode: 'shared',
      authorizationStrategy: 'project',
      sensitive: false,
      app,
      account: null,
      url: null,
      transport: null,
      endpoint: null,
      baseUrl: null,
      platform: null,
      spec: documentPath,
      auth: { type: 'none', in: 'header', name: null, prefix: null, secret: null },
      headers: {},
      policies: [],
    });
  }
  return { specs, errors };
}

/**
 * The stored `manifest_hash` of an App connector covers its document text, so
 * an edited `openapi.json` re-materializes the catalog on the next sync while
 * an unchanged one is reused.
 */
export function appToolsCatalogHash(manifestHash: string, documentText: string | null): string {
  return createHash('sha256').update(manifestHash).update('\0app-tools\0').update(documentText ?? '').digest('hex');
}
