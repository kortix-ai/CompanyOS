# Multi-account login implementation progress

2026-11-06. Canonical branch: `multi-account-login-plan`.
Status: NOT COMPLETE. Feature is not available or safe to enable.
User prohibits push, PR, merge, publication, and deployment.
Preserve the existing untracked plan and security research.

## Baseline

- Fetched `origin/dev` and fast-forwarded the canonical branch to `c68799e4cf`.
- Worktree marker has `dbMode: shared`. No product schema change has been applied.
- Docker reports server version `29.8.2`; primary local Supabase database container exists.
- No listener was reported on the worktree web port `17700`.
- The worktree CLI refuses shared-to-branch database conversion through `create`.
  Do not nuke/recreate the prepared checkout. Prepare its branch database with the existing helper,
  then update its registry/marker consistently before starting the stack. This remains undone.

## Implementation so far

Server-only modules in `apps/api/src/auth/browser-logins/`:

- `credentials.ts`: random 256-bit browser handles, domain-separated handle hashes,
  AES-256-GCM envelopes, randomized 96-bit nonces, explicit version/key identifiers,
  associated data binding the handle hash, slot and user, and old-key reads during rotation.
  Keyring is injected; no environment secret was added or read.
- `ingress.ts`: exact configured-origin and explicit custom-header checks for POSTs;
  rejects cross-site Fetch Metadata; never trusts forwarded host values.
  HTTPS cookie name uses `__Host-`; HTTP loopback names include the frontend port.
- These modules are NOT wired to routes or configuration. No runtime feature flag exists yet.

Tests were written and run before implementation. Each failed on its missing module.
After implementation:

- `bun test apps/api/src/auth/browser-logins/credentials.test.ts`: 4 pass, 0 fail, 17 assertions, 43 ms.
- `bun test apps/api/src/auth/browser-logins/ingress.test.ts`: 2 pass, 0 fail, 11 assertions, 56 ms.
- `pnpm --filter kortix-api typecheck`: exit 0 (before ingress.ts was added; repeat after subsequent changes).
- Targeted ESLint on the four files: exit 0, no errors; test files are ignored by existing ESLint configuration.

## Engineering rulings

1. Require fresh authentication for initial vault adoption. Do not transfer a rotating legacy refresh
   credential while old tabs/bundles can still refresh it. Do not claim a BroadcastChannel acknowledgement
   controls old code. This fits the approved reauthentication fallback.
2. Preview isolation needs a distinct authority path. Current `preview-origin.ts:sessionFromCookies`
   accepts a signed preview cookie without a tab selector. `preview-session.ts` binds it to sandbox/port,
   not the parent tab. Cookie partitioning does not distinguish two tabs on the same top-level origin.
   No remedy or real HTTP/browser proof exists yet. Do not count JWT subject assertions as preview proof.
3. Keep credentials entirely server-side. The encryption module is a building block, not a usable vault.

## Required next work

1. Complete Phase 0 first: route rewrite with real SSR/RSC/actions, stripping forged identity headers,
   same-origin ingress, distributed refresh across processes, preview authority isolation, MFA/SSO,
   legacy refresh ownership. Use synthetic users. Record actual HTTP and DOM/network evidence.
2. Prepare isolated branch database without another checkout or primary product-schema mutation.
3. Implement persisted vault/attempts, bounded cleanup/revocation retries, backend flag default off,
   recovery after disable, one-time candidate confirmation and distributed refresh.
4. Implement typed SDK broker and memory token adapter with failing public tests first,
   additive exports/docs/surface snapshot, targeted checks and smoke:install.
5. Migrate web request identity, navigation, isolated persistent state, lifecycle/streams and previews.
6. Implement existing-menu discovery, Google chooser and email flows, scoped logout, privacy-safe event,
   translations and user-facing help. Read all required visual/browser skills before those edits.
7. Run full approved synthetic A/B acceptance matrix, local demo, kickoff Sol loop at medium effort,
   then council with real screenshots. No review has run yet.

No real-surface acceptance gate has passed. No SDK, UI, migration, auth-provider, or runtime route has changed.
Do not report completion based on the six security primitive tests.
