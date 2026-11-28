import { DEPRECATED_KORTIX_PERMISSION_ALIASES } from '@kortix/manifest-schema';
import { toLegacyAction } from '@kortix/shared/workspace-actions';
import { canonicalConnectorAlias } from '../shared/connector-alias';
/**
 * The agent grant a session token carries (resolved from kortix.yaml in
 * projects/agents.ts): its connectors, secrets, Apps and policy sets, and the
 * normalization of its old `kortix_permissions` list. That list is enforced as
 * the agent's rules on the `kortix` connector (`iam/kortix-rules.ts`), by the
 * agent rule gate before every handler.
 *
 * A null grant (a laptop CLI PAT, a dashboard session, or a project that
 * declares no agents) imposes no restriction.
 */
import type { AgentGrant } from '@kortix/db';

// The request readers (`getAgentGrant`, `isProjectSessionPrincipal`,
// `isBorrowedSessionPrincipal`) read the Hono context, so they live in
// `middleware/agent-scope.ts`. Re-exported here so every importer keeps working.
export { getAgentGrant, isProjectSessionPrincipal, isBorrowedSessionPrincipal } from '../middleware/agent-scope';

/**
 * MANIFEST-INPUT NORMALIZATION, and nothing else.
 *
 * `project.cr.open` / `project.cr.merge` were the same capability as
 * `project.gitops.push` / `project.gitops.merge` under a second name: a route
 * gated CR creation as the former while the central capability fold gated the
 * underlying commit as the latter. Spec §2.4 collapsed them — neither string is
 * in `kortix.permissions`, so no route can assert one and no role can grant one.
 *
 * They are absent from `PROJECT_ACTIONS`, from the grantable catalog, from the
 * agent-grant editor and from `kortix validate --scopes`, so nothing offers
 * them as a live choice. They survive in exactly ONE place: a hand-written
 * `kortix_permissions:` (or legacy `kortix_cli:`) list in a kortix.yaml an author wrote before the collapse,
 * which both validators still ACCEPT (with a warning) precisely so that one
 * outdated string cannot fail a manifest and leave its agent with an empty
 * grant. This table rewrites such a
 * list to the live spelling ONCE, when the grant is resolved
 * (`canonicalizeGrantActions`, called from projects/agents.ts beside the
 * connector canonicalization). It is a spelling correction on INPUT — NOT a
 * runtime alias table, and NOT a second permission model: after normalization
 * `agentMayPerform` is a plain membership test against the catalog's spelling.
 */
const MANIFEST_ACTION_ALIASES = DEPRECATED_KORTIX_PERMISSION_ALIASES;

/**
 * Rewrite a grant's `permissions` list to the catalog's spelling.
 *
 * Call this exactly where `canonicalizeGrantConnectors` is called — once, on the
 * resolved grant — so every gate compares canonical to canonical.
 */
export function canonicalizeGrantActions(grant: AgentGrant | null): AgentGrant | null {
  if (!grant || grant.permissions === 'all') return grant;
  // A workspace name (`workspace.gitops.push`) resolves to the legacy name the
  // catalog stores, exactly like a renamed alias.
  const canonical = grant.permissions.flatMap((a) => MANIFEST_ACTION_ALIASES[a] ?? [toLegacyAction(a)]);
  return { ...grant, permissions: [...new Set(canonical)] };
}

/**
 * Actions an old `kortix_permissions` list never had to name: the membership
 * tiers `loadProjectForUser` asks for, and `none` (an operation with no IAM
 * check: the caller's own profile, a public read).
 */
const LIST_EXEMPT_ACTIONS: ReadonlySet<string> = new Set(['project.read', 'project.write', 'none']);

/**
 * An agent's `kortix_permissions` list read as rules: does it allow `action`?
 * No list, or `all`, allows. Both sides compare in the catalog's legacy
 * spelling (`canonicalizeGrantActions` rewrote manifest aliases on input).
 *
 * The agent rule gate asks it for each request's operation
 * (`iam/kortix-rules.ts`); `authorize` asks it for an action a handler derives
 * from the request content (a merge that changes an agent's grant needs
 * `project.agent.write`), so an agent never does through content what its
 * rules refuse it directly.
 */
export function agentListAllows(grant: AgentGrant | null | undefined, action: string): boolean {
  if (!grant || grant.permissions === 'all') return true;
  if (LIST_EXEMPT_ACTIONS.has(action)) return true;
  const wanted = toLegacyAction(action);
  return grant.permissions.some((a) => toLegacyAction(a) === wanted);
}

/**
 * Normalize a grant's connector list to CANONICAL slugs.
 *
 * Three gates compare this grant, and they historically saw three different
 * spellings of the same connector: the catalog compared the public alias
 * (`email`), the call gate the raw slug (`kortix_email`), and session create the
 * caller's binding key. With an exact `includes()` match, whichever spelling a
 * manifest author picked satisfied one gate and failed another —
 * `connectors: ["email"]` made the connector VISIBLE in the catalog and then
 * 403'd on call, which looks like a platform bug rather than a grant typo.
 *
 * Canonicalizing ONCE here means every gate can compare canonical-to-canonical.
 */
export function canonicalizeGrantConnectors(grant: AgentGrant | null): AgentGrant | null {
  if (!grant) return grant;
  const policySets = canonicalPolicySets(grant.policySets);
  const withSets = policySets ? { ...grant, policySets } : grant;
  if (withSets.connectors === 'all') return withSets;
  const canonical = withSets.connectors.map((slug) => canonicalConnectorAlias(slug));
  return { ...withSets, connectors: [...new Set(canonical)] };
}

/** A policy-set map with canonical slug keys, on a null prototype. */
function canonicalPolicySets(map: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!map) return undefined;
  const out: Record<string, string> = Object.create(null);
  for (const [slug, name] of Object.entries(map)) out[canonicalConnectorAlias(slug)] = name;
  return out;
}

/**
 * The policy set an agent grant assigns on connector `slug` (canonical), or
 * null for the base rules (no grant, or no entry). `Object.hasOwn` only: a
 * stored grant is parsed JSON on a normal prototype, and `constructor` is a
 * valid slug.
 */
export function agentPolicySet(grant: AgentGrant | null | undefined, slug: string): string | null {
  const map = grant?.policySets;
  if (!map || typeof map !== 'object') return null;
  if (Object.hasOwn(map, slug)) return String(map[slug]);
  if (Object.hasOwn(map, '*')) return String(map['*']);
  return null;
}

/**
 * True if the agent-session grant permits calling connector `slug` (or no grant).
 *
 * `slug` MUST already be canonical — call `canonicalConnectorAlias` on anything
 * that came from a manifest, a request body, or a stored row first.
 */
export function agentMayUseConnector(grant: AgentGrant | null, slug: string): boolean {
  if (!grant) return true; // no grant = no restriction
  if (grant.connectors === 'all') return true;
  return grant.connectors.includes(slug);
}

/**
 * True if the agent-session grant lists the Kortix App `slug` in `apps`
 * (spec 2026-09-22 §2.5). Unlike the other predicates, a missing `apps` key is
 * NONE, not "all": the field is new, deny-by-default in both manifest
 * versions, and the resolver omits it for an agent that declares no Apps.
 * A null grant (ungoverned project) never reaches this — the App gate keeps
 * the legacy human decision for it. Slugs compare lowercase (App slugs are).
 */
export function agentMayOpenApp(grant: AgentGrant, slug: string | null | undefined): boolean {
  const apps = grant.apps;
  if (apps === 'all') return true;
  if (!Array.isArray(apps) || apps.length === 0) return false;
  if (apps.includes('*')) return true;
  if (!slug) return false;
  const wanted = slug.toLowerCase();
  return apps.some((entry) => entry.toLowerCase() === wanted);
}

/** True if the agent may receive/read the project secret with this
 *  IDENTIFIER (or no grant). `env` is the grant's `secrets` allowlist — a list
 *  of secret IDENTIFIERS (not raw env-var keys; see project_secrets.identifier
 *  / resolveGrantedSecretEnv), optional for back-compat with tokens minted
 *  before the field existed — those are treated as 'all' (unrestricted). This
 *  is the SOLE gate on agent secret access — there is no resource-side
 *  allow-list on the secret itself. */
export function agentMayUseEnv(grant: AgentGrant | null, identifier: string): boolean {
  if (!grant) return true; // no grant = no restriction
  const env = grant.env ?? 'all';
  if (env === 'all') return true;
  // Identifiers are free-form-ish but a kortix.yaml `secrets:` allowlist
  // is hand-written and may use any case. Match case-insensitively so
  // `secrets: ["gmaps-primary"]` still admits identifier "GMAPS-primary".
  const target = identifier.toUpperCase();
  return env.some((e) => e.toUpperCase() === target);
}
