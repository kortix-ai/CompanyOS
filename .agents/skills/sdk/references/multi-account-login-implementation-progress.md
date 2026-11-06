# Multi-account login implementation progress

2026-11-06. Canonical branch: `multi-account-login-plan`.
Status: NOT COMPLETE. Feature is not available or safe to enable.
User prohibits push, PR, merge, publication, and deployment.
Preserve the existing untracked plan and security research.

## Historical baseline (superseded)

The backend and SDK continuation below supersedes setup, wiring, acceptance, and remaining-gap claims in the earlier sections.

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

## Backend stage, 2026-11-06

Status: BACKEND NOT YET READY FOR ENABLEMENT. Entire feature remains NOT COMPLETE.
No push, PR, merge, publication, or deployment occurred.

Engineering ruling: the user authorizes a dormant default-off backend before full UI/preview
Phase 0 proof. No UI enablement or Phase 0 completion follows from these backend tests.
A second explicit ruling permits adding timeout declarations to the new unpublished migration
already applied only to this isolated local database. This permission does not apply to shared,
published, dev, staging, or production migrations. No applied-state ledger was edited.

### Isolation and configuration

- Existing slot 47 and its marker/registry now use `dbMode: branch`.
- `createBranchDb` copied the primary into `kortix_wt_multi_account_login_plan`.
- `syncBranchUsers(..., false)` reconciled only this branch. The helper accepts an optional
  `reconcileOthers` argument; its existing default remains unchanged.
- No product migration ran on the primary. A separate fresh database
  `kortix_wt_multi_account_login_vault_proof` received the corrected migration through `local-up`.
- `KORTIX_BROWSER_LOGINS_ENABLED` defaults false. Explicit true enables initialize/begin/email/complete/confirm.
- `KORTIX_BROWSER_LOGINS_ACTIVE_KEY` selects the write key.
- `KORTIX_BROWSER_LOGINS_KEYS` is a JSON map of key IDs to canonical base64 32-byte keys.
  Keep old keys during rotation. Missing/malformed keys return 503; no insecure key fallback exists.
- A random key exists only in this worktree's ignored `apps/api/.env.local`; its flag remains false.
  Tracked files contain no key. Test keys are synthetic fixtures.
- Five live identities per handle; ten unexpired attempts; five-minute attempts;
  30-day idle and 90-day absolute handle expiry. One handle-row PostgreSQL lock serializes all
  mutations/refresh for that browser across replicas. Refresh uses a revision predicate.

### Registered contracts

Prefix: `/v1/auth/browser-logins`. No backend active-user selector exists.

- `POST /initialize`: mint browser handle cookie without a legacy Supabase cookie.
- `GET` prefix root: private/no-store roster with slot, verified user ID, email, expiry.
- `POST /begin`: method password/email/google; returns attempt and optionally Google authorize URL.
  Google uses server-owned PKCE, fixed frontend callback, attempt-bound redirect, and select_account.
- `POST /attempts/:attempt/email`: reuse headless email policy and sending with create_user false.
- `POST /attempts/:attempt/complete`: password credentials, email/token, or Google code.
  Reuses headless password/OTP validation; Google exchanges server-owned verifier.
  GoTrue /user verifies candidate identity; auth.sessions verifies the user/session association.
- `POST /attempts/:attempt/confirm`: persist candidate and return slot. Repeated verified user reuses
  the existing slot; duplicate candidate remains cancellable and expires into cleanup.
- `POST /attempts/:attempt/cancel`: expire candidate immediately, revoke only its session.
- `POST /slots/:slot/token` and `/resolve`: return short-lived access_token, expires_at, user_id.
  These remain available after flag disable. No refresh credential leaves the server.
- `POST /slots/:slot/remove` and `/remove-all`: commit tombstone before upstream revocation;
  retain encrypted credentials when revocation remains pending. Return removed and revocation_pending.
  The existing logout route and vault reuse `revokeLocalSession` for local GoTrue scope/bookkeeping.
- All POSTs require configured Origin and `x-kortix-browser-login: 1`; cross-site Fetch Metadata fails.
  Cookie is HttpOnly, SameSite=Lax, Secure/__Host on HTTPS; loopback cookie includes frontend port.
- Errors redact upstream identity/credential text: 401 browser_login_required; uniform 404
  browser_login_slot_unavailable; 403 browser_login_forbidden; 409 attempt unavailable/authentication
  failed/verification required/revocation pending; 429 browser_login_limit; 503 unavailable/disabled/
  reauthentication_required. Malformed input currently falls through the redacted 503 boundary.
- GoTrue fetches now have a 20-second deadline. A returned ambiguous refresh failure persists an
  encrypted uncertainty marker, preventing automatic reuse of that credential.
- Leader-owned browser-logins job uses existing leaderTimer/runWorkerTick/JOBS registration.
  Each tick handles at most 10 expired attempts and 10 expired/pending slots, then bounded deletes.
  Failed upstream revocation does not become a success receipt.

### Verification evidence

All commands ran from this canonical worktree; private logs and launchers are under ignored output/.

- Config test ran before implementation: missing module, exit 1. After implementation, the three
  primitive/config files: `bun test apps/api/src/auth/browser-logins/config.test.ts
  apps/api/src/auth/browser-logins/credentials.test.ts apps/api/src/auth/browser-logins/ingress.test.ts`:
  8 pass, 0 fail, 32 assertions, 49 ms.
- `bun output/launch-test.ts`: launches the named `vault.integration.test.ts` with local GoTrue
  credentials and this branch DB; real Bun HTTP listener plus a second independent Bun replica.
  Latest recorded run: 6 pass, 0 fail, 55 assertions, 2.09 s.
  Covers synthetic A/B password candidates, confirmation, failed-add preservation, foreign-browser
  slot rejection, CSRF rejection, private roster, two-process forced refresh with one revision
  increment, old-key read/new-key write, disabled-replica token recovery and rejected begin,
  B removal preserving A and B's other-device session, real GoTrue email OTP confirmation/replay,
  actual anon/authenticated SELECT denial on all three tables and RLS catalog assertions.
  Google uses a controlled authorize response: PKCE challenge, select_account, browser-bound attempt,
  cancellation and replay boundaries pass. This is not a real Google provider login.
- `bun test scripts/worktree/__tests__/branch-db.test.ts`: 4 pass, 0 fail, 10 assertions, 2.62 s.
  This existing helper suite exercises its default reconciliation behavior; do not repeat it to
  provision this worktree. Provisioning used the explicit own-branch argument.
- API typecheck and targeted ESLint: exit 0. DB typecheck: exit 0.
- `bun output/migrate-fresh-vault.ts`: Migration exit 0 on fresh isolated copy using standard runner.
- `pnpm --filter @kortix/db lint`: exit 0, Found 0 issues in 372 files (historical warnings remain).
- `bun output/schema-contract.ts`: one unrelated existing index drift remains:
  idx_project_sessions_one_available_warm exists in the copied DB but is absent from the schema.
  All vault table/column/unique declarations match. Snapshot generated with the standard generator.

### Exact remaining backend gaps

1. Durable encrypted refresh ownership now commits before the upstream request. Another replica
   cannot reuse that refresh credential after a crash. The test observes the committed marker from
   an independent DB connection during the upstream call, then proves a returned failure is not retried.
   An actual process-kill-at-the-boundary drill remains unrun. Pending ownership fails closed.
2. Routes now use Hono timeout with a 25-second response deadline and a 16 KiB body limit.
   GoTrue has a 20-second upstream deadline. An actual timeout/cancellation drill remains unrun;
   Hono response timeout does not prove cancellation of all already-running work.
3. Revocation cleanup needs fair/backoff scheduling and forced failure/restart retention tests.
   Pending rows remain encrypted; no claim that upstream revocation succeeded on failure.
4. MFA/SSO/signup policy acceptance needs real local fixtures. Password/OTP reuse headless policy,
   but no full factor challenge broker exists. Candidate AAL is in JWT, not a dedicated persisted field.
5. HTTP tests mount the registered router on a real listener; the full worktree stack/web /v1 proxy
   cookie ingress has not been exercised. No UI/SSR/preview proof exists.
6. Email completion uses a real GoTrue-generated OTP. Actual email delivery endpoint remains unproved.
7. Real Google provider chooser and callback exchange remain unverified; controlled boundaries pass.
8. Remove-vs-refresh termination races, five-identity limit, expiry/cleanup and failed revocation need
   explicit real-DB acceptance tests. No complete acceptance claim follows from the current tests.
9. Browser add/remove audit events still need the existing audit convention; legacy logout retains audit.
10. Route OpenAPI descriptions and generated route inventory need integration before the SDK stage.

Keep the flag off. Parent must finish these backend gaps before treating this stage as complete,
and must finish SDK/web plus all Phase 0 isolation gates before feature enablement.

### Refresh durability follow-up in the same stage

The token path now uses two transactions. The first commits an encrypted owner marker.
The second rechecks ownership under the handle lock, calls GoTrue once, and stores the result
with the revision predicate. Other processes wait for bounded polling or return refresh_pending.
An uncertain response persists a reauthentication-required state. A crashed owner cannot cause
a future automatic refresh of the original credential. Removal still commits its tombstone first.
No ownership marker is an in-memory lock.


## Backend and typed SDK continuation, 2026-11-06

Status: backend/SDK stage implemented and locally verified. Entire feature remains NOT COMPLETE.
Canonical checkout and branch remain unchanged. No push, PR, merge, publish, or deploy.
The original plan and security research remain untracked and unchanged.

### Backend decisions and contracts

- Additive migration `20261106141242777_browser_login_revocation_schedule.sql` adds
  `revoke_attempts` and `revoke_after` to attempts and slots. Applied only to the existing branch DB.
  Drizzle snapshot and schema agree. The previously applied vault migration was not edited.
- Cleanup selects due rows in deterministic schedule order. It commits the next schedule before I/O.
  Backoff starts at 30 seconds and caps at one hour. A tick selects at most ten rows per kind.
  Twelve scheduled attempts exhaust automatic retries; encrypted credentials remain retained.
  Explicit cancel/remove can retry retained rows. Operators can requeue exhausted rows by resetting
  retry metadata. Exhaustion is not a revocation-success receipt.
- Removal refresh also commits encrypted ownership before sending a rotating credential.
  An interrupted owner fails closed; it never automatically reuses the old refresh token.
- Password/email handlers share the original request context and existing throttle/policy functions.
  Broker candidates suppress premature login analytics. There is no nested router request.
  The existing trusted-proxy client-IP helper remains the authority; no new XFF interpretation exists.
- Complete verifies the provider identity and enforces SSO for every alternate flow.
  Newly created Google identities also use the existing signup policy. Denied acquired sessions remain
  encrypted in consumed, expired attempts for revocation instead of being rolled back and lost.
- `POST /attempts/:id/mfa/factors`, `/mfa/challenge`, `/mfa/verify` and the corresponding
  `/slots/:id/mfa/*` routes bind factor operations to that browser's candidate or saved session.
  Factors returns only `{factors:[{id,factor_type,status}]}`. Challenge returns `{id,expires_at}`.
  Verify requires `{factor_id,challenge_id,code}` and returns only `{verified:true}`.
  Verify checks the returned user, session association, and AAL2 before replacing encrypted credentials.
  Confirmation and token resolution reject AAL1 when factors or account policy require AAL2.
  Account membership reads live in the existing IAM read model.
- Initialization replaces malformed, unknown, or expired cookies. Infrastructure failures still fail closed.
  Malformed JSON/schema input returns 400. Authentication rejection remains redacted; unavailable
  upstreams return 503. Throttles preserve 429 and Retry-After where supplied.
- Each broker operation uses the existing audit writer with route templates/status and no credentials,
  cookie, slot value, email, or user-provided error text in operation metadata.
- Routes register explicitly through `registerBrowserLoginRoutes`. OpenAPI describes all 17 broker
  routes with typed input/response schemas. Standard inventory generation reports 1,076 total routes.
  The generated audit-route catalog is synchronized.
- The feature flag remains OFF in machine configuration. Controlled test processes enable it only locally.
  Existing token, MFA recovery, cancellation, and removal remain usable after flag disable.

### SDK public contract

- Additive root exports: `browserLogins`, `createBrowserIdentity`, `BrowserBrokerOptions`,
  `BrowserIdentityOptions`, `BrowserLoginCompletion`, `BrowserLoginSlot`, `BrowserLoginToken`.
  No subpath was added; package export maps remain unchanged. Runtime/type snapshots were updated
  additively; root canonical, package export, and framework import guards pass. No version bump.
- `kortix.auth.browserLogins` references the same broker object. Methods: initialize, roster, begin,
  sendEmail, complete, confirm, cancel, token, remove, removeAll, mfaFactors, challengeMfa, verifyMfa.
  Requests use fixed same-origin `/v1/auth/browser-logins`, credentialed cookies, no-store, the broker
  custom header, injected fetch, and no bearer. Errors preserve `HeadlessAuthError.status`, including 429.
- `createBrowserIdentity({fetch,saveSlot,now})` exposes getToken/getUserId/select/getSlot,
  invalidateRoster/subscribe. Access tokens exist only in memory. The host may persist only the opaque
  slot in per-tab storage through saveSlot. No browser globals, refresh token, localStorage, or channel.
- getToken coalesces acquisition and rejects stale completions after generation changes. getUserId
  returns the same cached identity snapshot. Host roster invalidation subscriptions contain no tokens.
- The existing getToken function contract accepts an optional `identityKey` method. The adapter supplies
  its slot/selection generation. Transport checks this scope before dispatch and before/after 401 refresh.
  It also checks the user snapshot before replay. Old mutations never replay after slot/user changes,
  including changing slots for the same user. Legacy getters without identityKey remain compatible.
- SDK README and developer reference describe this seam. Web wiring, identity-scoped caches and stream
  cleanup remain the parent's next stage. Keep one createKortix client per host.

### Verification (all commands use this canonical worktree)

- TDD red evidence remains under ignored output/: malformed JSON returned 503 before correction;
  SDK missing export, missing broker/MFA methods, cross-user replay, same-user generation replay,
  initial-dispatch generation race, missing retry scheduling and SSO alternate-flow bypass each failed
  before implementation. No test assertion was weakened to obtain green.
- `bun output/launch-test.ts`: 14 pass, 0 fail, 112 assertions across named vault/capacity HTTP/PG files.
  The runner names both files explicitly. Capacity is standalone to keep each file below roughly ten seconds.
  Uses real local GoTrue, branch PostgreSQL, HTTP, synthetic identities, and independent Bun replicas.
  Covers five-identity cap with six concurrent confirmations; forced refresh/removal race; expiry;
  failed revocation retention, persisted backoff across process restart, and later-row fairness;
  SIGKILL during upstream refresh with zero old-token reuse afterward; controlled Google PKCE exchange
  and consumed-attempt replay; enforced SSO alternate-flow denial; real TOTP challenge/verification
  with rejected AAL1 confirmation; typed SDK cookie HTTP round trip; prior A/B and RLS boundaries.
- `bun test apps/api/src/__tests__/unit-auth-headless.test.ts`: 26 pass, 0 fail, 117 assertions.
- `bun output/launch-proxy-proof.ts`: full assembled API app on own port 17708 plus actual Next server
  on own port 17700. PASS initialize/add/token/disabled-after-use recovery/remove; every response no-store.
  PASS persisted per-operation audit metadata excludes cookie/slot values. No primary process was used.
- `pnpm --filter @kortix/sdk typecheck`: exit 0, SDK and executable examples.
- `pnpm --filter @kortix/sdk test` with explicit files: core/auth/browser-identity.test.ts,
  core/http/transport.test.ts, index.isomorphic.test.ts, root-canonical.test.ts,
  package-exports.test.ts, public-surface.test.ts, public-type-surface.test.ts.
  All named files pass; no full package/suite run occurred.
- `pnpm --filter @kortix/sdk run smoke:install`: packed install imports and constructs successfully.
- API and DB typecheck: exit 0. Targeted API ESLint: exit 0.
  DB migration lint: Found 0 issues in 373 files. Standard runner: Migration exit 0.
- `bun output/dump-broker-routes.ts`: standard route dumper, synthetic managed-mode configuration,
  1,076 routes. Standard web audit catalog generator: 1,076 routes.
- Private launchers and raw logs stay in ignored output/. No secrets or real identity records were committed.

### Parent acceptance and limits

- No real Google provider login or external email delivery is claimed. Google exchange is controlled;
  password, email OTP, and TOTP use real local GoTrue. Browser UI/provider journeys remain the next stage.
- No UI/SSR/RSC/action/cache/preview isolation proof follows from the HTTP proxy test.
  No CDN/IIFE browser execution claim follows from the installed Node ESM smoke.
- A Hono timeout bounds the response; cancellation of already-running work remains unproved.
  Ambiguous refresh and terminated owners fail closed and require reauthentication.
- The known unrelated schema index drift remains unchanged.
- Parent must finish web identity routing/cache/preview/UI, real browser journeys, and the requested
  kickoff review delegation. No subagent or review delegation ran in this implementation stage.
- Shippable to production: NOT YET. The flag stays off until the entire acceptance plan passes.

## Web request-boundary groundwork, 2026-11-06

Status: WEB STAGE INCOMPLETE. This section does not supersede the backend/SDK evidence above.
It supersedes any inference that starting the web stage means the approved vertical feature exists.
The browser-login flag remains off in configuration. No push, PR, merge, publish, or deploy occurred.

Added (not yet connected to production consumers):

- `apps/web/src/lib/auth/browser-route.ts`: locale-aware opaque-selector grammar, selector-free
  copy/share paths, private-path navigation propagation, and internal identity-header stripping.
- `apps/web/src/lib/auth/browser-request.ts`: request-scoped host fetch adapter for the public SDK
  browser broker. It accepts trusted configured origins, sends only the matching vault cookie,
  rejects missing/duplicate handles, rejects non-HTTPS origins outside loopback, forbids redirects,
  and propagates the request abort signal. It stores no process-global identity or token.
- `apps/web/src/lib/auth/browser-route.test.ts`: targeted grammar and adapter boundary tests.
  Initial RED: missing browser-route module. GREEN: 6 pass, 0 fail, 24 assertions, 50 ms.

Verification from this canonical worktree:

- `bun test ./apps/web/src/lib/auth/browser-route.test.ts`: 6 pass, 0 fail.
- From `apps/web`, `pnpm exec eslint src/lib/auth/browser-route.ts
  src/lib/auth/browser-request.ts src/lib/auth/browser-route.test.ts`: exit 0.
- `pnpm --filter Kortix-Computer-Frontend typecheck`: exit 0 before the adapter split;
  final typecheck after the split also exits 0 (`output/web-stage-typecheck-final.log`).
- `bun output/launch-web-request-proof.ts`: exit 0. Real assembled API on 17708 and the existing
  isolated branch DB; two newly created synthetic GoTrue users; concurrent host-adapter resolutions
  return their respective user IDs. Missing handle and foreign slot reject. After disabling the
  process-local flag, A resolves, removing B rejects B, and A still resolves. Synthetic users are
  deleted in finally. Private launcher and evidence: `output/web-request-proof.log`.
- This proof does NOT exercise middleware, Next SSR/RSC/actions, a browser, or previews.
  It is new adapter evidence, not a repeat or replacement of the earlier backend acceptance tests.

Exact outstanding implementation remains the approved web plan: middleware rewrite and server
identity; central Link/router adoption; selected AuthProvider/Supabase/MFA adapter; scoped persistent
state and late-writer fencing; preview-origin authority isolation; saved-sign-in UI/callback/chooser;
translations, analytics, help; browser A/B/runtime/preview/terminal/download acceptance and demo.
No new UI, screenshot, recording, or complete web journey exists from this continuation.
The original plan and security-research files remain unchanged and untracked.
Parent kickoff Sol loop and council remain unrun. Feature enablement remains unsafe.

## Production consumer wiring continuation, 2026-11-06

Status: consumers connected and real Next SSR/RSC verified; milestone acceptance remains INCOMPLETE.
Feature remains unsafe to enable. No push, PR, merge, deploy, or publication occurred.
Original untracked plan/research remain untouched. SDK source was not changed.

### Production changes

- Middleware strips inbound browser identity headers before processing. Explicit locale/slot page URLs
  resolve the vault handle through the SDK broker, then verify the same subject with SDK `authUser`.
  Selected protected pages rewrite onto existing locale routes with request-only slot/access-token
  headers. Responses declare private/no-store. Missing/foreign/unavailable selections return a generic
  401 at the original URL; they never enter legacy authentication. Unsupported selected paths return 404.
  Existing slots resolve after flag disable. Unselected routes retain legacy behavior.
- `supabase/server.ts` selected getUser/getSession use the selected bearer and SDK user endpoint with
  request-local state. Selected cookie reads are empty; credential operations reject. No selected
  credential writes or process-global SDK configuration occur. `/projects` now verifies the selected
  server user before rendering its existing ProjectSelector. Session metadata inherits selected
  getSession through the same server factory.
- Server factory inventory: session-tab-title-server, auth actions, auth/mobile callbacks,
  maintenance route/bypass, and sign-out-actions import this factory. Callbacks at unselected URLs
  remain legacy. Selected credential methods fail closed. Maintenance API URLs are unselected;
  migrating non-page selected API/action routing still needs explicit acceptance.
- `browser-document.ts` creates one memory-only SDK identity per selected document. SDK configuration
  receives getToken/getUserId from that identity. Legacy token helpers also delegate selected reads.
  URL slot changes invalidate the old generation and replace the document. Losing a selector in the
  same document throws instead of adopting a legacy identity.
- AuthProvider selected bootstrap verifies SDK user against the token snapshot. It skips legacy
  Supabase initialization/listeners, marker adoption, and global cache reset. Broker invalidation
  removes published user/session and enters the existing retry error boundary. Cleanup unsubscribes
  its own listener. Selected sessions contain an empty refresh-token compatibility field, no credential.
- Selected browser Supabase clients have no storage, automatic refresh, or URL credential detection.
  Auth reads use SDK; shared auth events have no subscription; other auth controls reject. Shared
  performSignOut rejects selected documents before invoking any global reset or legacy sign-out.
- RouterBridge propagates selection on push/replace and captures ordinary private anchor clicks.
  Private path propagation includes actual app prefixes. This is basic integration, not a link sweep.

### Evidence

All commands run in this worktree. Private logs/launchers remain in ignored `output/`.

- RED `bun test ./apps/web/src/lib/auth/browser-consumer.test.ts`: missing verified resolver export.
- Resolver/route/provider named files: 17 pass, 0 fail, 67 assertions, 22 ms.
  The existing source-text sign-out assertion initially failed when the provider changed its sink.
  The fix preserves the shared sink and puts the selected guard in performSignOut; assertions unchanged.
- New consumer file, including legacy-refresh and auth-event rejection: 2 pass, 0 fail, 4 assertions,
  34 ms (`output/consumer-capability-tests.log`).
- Web typecheck exits 0 (`output/consumer-typecheck-final.log`). Changed-file ESLint exits 0;
  a displaced use-client directive warning was fixed (`output/consumer-eslint-last.log`).
- `bun output/launch-consumer-http-proof.ts` exits 0 against actual Next 17700, assembled API 17708,
  and the existing isolated branch PostgreSQL database. Creates and deletes synthetic users.
  One vault jar plus a real legacy A session cookie accompanies concurrent A/B `/u/<slot>/projects`
  requests. Both return 200. Instrumented API responses prove each subject is verified by middleware
  AND the production projects server getter. No request token response header is returned.
  Real B RSC returns 200 and text/x-component. Foreign slot and missing handle return 401 despite
  forged internal headers. Flag-off A SSR returns 200. The proof removes the saved slots afterward.
  Next dev replaces the configured private/no-store header with `no-store`; production header behavior
  is unverified. Initial proof instrumentation could not parse compressed API bodies; requesting identity
  encoding fixed the ignored observer. This was a proof-observer failure, not an auth fallback.
- T3 preview opens an unavailable selected route and observes exactly “Browser identity unavailable”,
  no interactive elements. The owned tab is closed. Authenticated browser A/B lifecycle is NOT verified.
- Own Next launcher/process was stopped after verification. No pre-existing listener was stopped.

### Required remaining acceptance and work

1. Real identity-sensitive Server Action round trip is UNVERIFIED. No action acceptance is claimed.
2. Authenticated browser bootstrap, cross-tab Supabase event races, connection disposal, identity switch,
   recovery retry and client-side navigation require DOM/network acceptance. HTTP RSC proof alone
   does not establish those contracts. The new capabilities have focused protocol tests only.
3. Direct next/navigation push/replace calls, prefetch, modifier-key/new-tab anchors, forms, auth return
   destinations, public-to-private transitions, and non-page API routing need the parent's navigation stage.
   RouterBridge and ordinary anchor capture do not cover every direct router call.
4. Persisted Query/Zustand/storage caches and late writers remain unscoped. No global reset was added.
   Existing SDK runtime/stream hooks still require the scoped-state teardown acceptance. Do not enable.
5. Selected Supabase MFA/profile/password/credential controls deliberately reject until migrated.
   Broker candidate controls, selected logout/removal UI, discovery, Google/email flows and chooser
   remain next-stage work. No visual/menu implementation was added.
6. Preview authority isolation, download/terminal/runtime acceptance, help/translations/analytics,
   kickoff review, council and the complete A/B acceptance matrix remain outstanding.

## Imperative navigation and authenticated browser probe, 2026-11-06

Status: PARTIAL milestone. State/navigation/client acceptance is NOT complete. Default remains OFF.
No SDK edits, push, PR, merge, deployment, or publication. Original research plans remain untracked.

- `lib/navigation/use-identity-router.ts` owns host imperative push/replace/prefetch. Host router consumers,
  including KortixUiProvider and RouterBridge, import this adapter. UI package components already receive
  the host router through UiProvider; no direct Next router imports exist there. Marketing-only and public
  share components retain their existing imports. Adapter adds the current selector to private destinations,
  preserves an explicit other selector, and performs a document navigation when selection changes.
  It invalidates the previous token generation before requesting document navigation. Connection teardown
  beyond document unload is NOT verified.
- `browser-route.ts` no longer changes an explicit B destination to A. Public/share paths lose selectors.
  RouterBridge now also intercepts explicit cross-slot ordinary clicks. Prefetch uses the same path adapter.
- `browser-document.ts` records the immutable document slot separately from the token adapter selection.
  Invalidating the adapter during unload must not race a render into reloading the old URL.
- Selected SDK host configuration uses same-origin `/v1`; legacy configuration retains its backend URL.
  Actual browser data requests exposed a cross-origin fetch failure with the isolated launcher. Broker
  requests succeeded while account reads failed. The selected same-origin configuration fixes these reads.
- Local launcher initially omitted KORTIX_API_PROXY_TARGET and sent browser broker requests to port 8008.
  Ignored launcher now sets 17708. One restart attempted before its own orphan listener exited returned
  EADDRINUSE. Only the identified child of this session was terminated. No foreign process was killed.

Evidence (private files under ignored output):

- RED `bun test ./apps/web/src/lib/auth/browser-route.test.ts`: 6 pass, 1 fail; explicit B became A.
  GREEN same command: 7 pass, 0 fail, 26 assertions, 32 ms.
- `pnpm --filter Kortix-Computer-Frontend typecheck`: exit 0 (state-navigation-typecheck.log and
  navigation-final-typecheck.log). Changed-file ESLint: exit 0, 0 errors, existing hook warnings.
- Actual T3 preview browser, same incognito profile, separate A/B `/u/<slot>/projects` tabs:
  both DOMs show their respective synthetic identities. Actual same-origin broker + `/v1/auth/user`
  fetches verify each expected subject. Actual authenticated `/v1/accounts` returns 200 in both tabs.
  A reload paints A. No mock auth provider or imported handler was used.
- Fixture broker sessions originate from the real backend and local GoTrue against the isolated DB.
  The test injects the synthetic vault handle as a browser cookie. This does not verify HttpOnly cookie
  delivery or real login UX. No private projects were created; private marker/draft acceptance is unrun.
- **FAILED acceptance:** actual broker removal of B returns 200, B token request returns 404, but B's
  already rendered identity remains visible. A token still returns 200 and A remains visible.
  This proves a missing client revocation/display lifecycle, not successful revocation acceptance.
- Private sanitized DOM/network result summary: `output/navigation-browser-evidence.json`.
  Synthetic screenshots: `output/navigation-browser-A.png`, `output/navigation-browser-B-revoked.png`.
  Server logs: browser-lifecycle-api.log and browser-lifecycle-next-fixed.log.

Required continuation before this milestone can be called complete:

1. Scope persisted Zustand/current workspace/drafts/settings and identity marker. Existing query/saved-copy
   keys already include userId; selected AuthProvider still does not adopt them. Separate detach/reset/delete
   in device-caches and registered stores. Legacy reset/prefix sweep must never delete sibling data.
2. Fence late writers and implement revocation/focus/BFCache display validation and connection disposal.
   The concrete failed B removal browser acceptance above is the first regression to close.
3. Actual rendered Link hrefs, modifier/new-tab, forms/action targets, server redirects, auth returns,
   notifications and analytics remain unmigrated. Imperative migration is not complete navigation coverage.
4. Server actions inventory finds auth/actions.ts and auth/sign-out-actions.ts. Real Next Action protocol
   acceptance is still unrun; no selected mutation authorization claim is made.
5. Two private project markers, cache/draft isolation, soft/hard/new-tab/back/focus, legacy auth events,
   runtime streams, notification attribution and IndexedDB acceptance remain required.
6. Preview/menu/callback/chooser work and final kickoff reviews remain outside this continuation.

## Revoked-document lifecycle and persistent ownership continuation, 2026-11-06

Status: implementation advanced; bounded milestone acceptance INCOMPLETE. Default flag remains OFF.
No push, PR, merge, publication, deployment, new branch, checkout, or delegated work occurred.
Canonical branch remains multi-account-login-plan, starting at 694eec08f9. Original untracked plans remain untouched.

### Ownership and lifecycle

- AuthProvider now serializes selected-document validation. A generation fence rejects late bootstrap publication.
  Requests during validation coalesce. Failed acquisition does not recursively retry its own invalidation.
  Focus, pageshow (including persisted pageshow), and online trigger validation. A 30-second heartbeat
  detects removals outside this document; each validation has a 15-second bootstrap deadline.
  Timer scheduling can be suspended by the browser. Focus/pageshow validates on return.
  The nominal foreground detection bound is 45 seconds (30-second interval plus 15-second deadline).
- Explicit validation hides private children, detaches persistence, clears this document's QueryClient,
  and resets SDK session controllers/state before publishing. Background heartbeat keeps the verified
  view during its request, then clears it on failure. Successful verification republishes the user.
  401/404 clears the selected SDK slot permanently for this document. Token getters cannot borrow
  the legacy session. Network/5xx errors remain retryable and do not remove the broker identity.
- Added host removeBrowserDocumentLogin: SDK broker removal, own matching invalidation, and a
  token-free BroadcastChannel message carrying only the affected slot. Receiving documents compare
  only their own slot. No selected identity or token is broadcast. Direct broker calls outside this
  host helper are detected by authorization failure, focus, or heartbeat.
- Managed localStorage and sessionStorage now resolve selected documents through an immutable
  verified-user adapter. Physical keys: identity-storage:<encoded-user-id>:<original-key>.
  localStorage persists user-owned state across that user's documents. sessionStorage retains its
  browser tab scope as well as the user namespace. Project/session/workspace scope remains in each
  original key. Selected documents never read unowned legacy keys. Writes/removals stop on detach.
  A document cannot adopt another user. Namespace enumeration and cache pruning see only its owner.
- Current account and all persisted Zustand store modules register adoption rehydration. Drafts use
  the same managed ScopedCache. First-party direct localStorage/sessionStorage operations in web/UI
  now use the existing managed adapter, including settings, workspace dismissal state and markers.
  These are storage substitutions, not a menu/navigation/preview implementation sweep.
- Selected AuthProvider adopts query and saved-copy stores only after SDK subject verification.
  Query and IndexedDB saved-copy keys retain their existing user owner. detachDeviceCaches stops
  the document's persisters without deleting copies. clearDeviceCaches purges only its adopted owner.
  Retained saved-copy handles stop reads/writes after detach. Purge uses a separate owner-bound index.
  Legacy reset no longer clears all IndexedDB records or sweeps sibling query-cache entries.
- Selected documents do not initialize PostHog or modify shared Web Push registrations. This narrow
  disablement prevents attribution and endpoint reassignment until their complete migration lands.
  Legacy paths retain their existing registration and analytics behavior.

### RED/GREEN and local checks

All commands use this canonical worktree. Raw evidence remains in ignored output/.

- RED: bun test ./apps/web/src/lib/auth/browser-lifecycle.test.ts: missing lifecycle module.
  GREEN final: 3 pass, 0 fail, 7 assertions, 3 ms. Covers stale bootstrap, terminal revocation,
  503 recovery, and concurrent invalidation coalescing. Microtask flushing uses no real-time sleeps.
- RED: bun test ./packages/sdk/src/platform/storage/identity-storage.test.ts: missing storage adapter.
  GREEN final via SDK named runner: 1 pass, 0 fail, 4 assertions, 11 ms. Covers ambiguous legacy read,
  sibling drafts, detached write/removal, immutable ownership, and same-owner reattachment.
- Named host run: browser-lifecycle.test.ts, browser-consumer.test.ts, device-caches.test.ts,
  reset-client-state.test.ts: 30 pass, 0 fail, 68 assertions, 87 ms.
  The device purge test first caught the detached index-read defect; owner-scoped purge fixes it.
  The old reset timing assertion expected a global purge delay. It now asserts the global purge
  cannot delay reset; sibling namespaces must survive. The hanging-global-purge mock remains installed.
- pnpm --filter @kortix/sdk test with explicit files: platform/storage/identity-storage.test.ts,
  platform/storage/managed-storage.test.ts, core/auth/browser-identity.test.ts,
  react/reset-identity-state.test.ts, index.isomorphic.test.ts, root-canonical.test.ts: all pass.
  SDK root/public names and version remain unchanged. New methods are on the existing internal storage entry.
- pnpm --filter @kortix/sdk typecheck: exit 0. Includes executable examples.
- pnpm --filter @kortix/sdk run smoke:install: exit 0; packed ESM import and construction pass.
- pnpm --filter Kortix-Computer-Frontend typecheck and pnpm --filter @kortix/ui typecheck: exit 0.
- Changed-file web ESLint: 0 errors, 25 warnings. Changed-file UI ESLint: 0 errors, 2 warnings.
  Includes pre-existing hook/ref warnings and the selected gate's effect state warning.
- pnpm --filter @kortix/ui test src/internal/notifications/web-push.test.ts: 22 pass, 0 fail,
  51 assertions, 17 ms. An initial missing-location test-environment error was fixed with optional access.
- git diff --check: exit 0. No package-wide/full suite ran.

### Real browser evidence and remaining acceptance

- Own assembled API 17708, actual Next 17700, branch database, real local GoTrue, one synthetic vault,
  and same-profile A/B documents. Local proxy explicitly targets 17708. No mock AuthProvider.
- B rendered its synthetic identity before actual POST broker removal returned 200. At the 20,672 ms
  observation, B's token requests included 404, its identity was absent, and only retry UI remained.
  Focus and synthetic persisted pageshow did not restore B. B had zero input/textarea controls.
  A still rendered its identity. Actual A token and authenticated accounts requests both returned 200.
  Synthetic screenshot: output/lifecycle-B-revoked.png. Sanitized summary: output/lifecycle-browser-summary.json.
- Earlier browser failures exposed self-invalidation during concurrent validation and SSR/client gate
  mismatch. Validation now invalidates only when a serialized request starts; the selected gate mounts
  after hydration. The final revocation observation above follows those fixes.
- Project creation was attempted through the actual authenticated HTTP API for BOTH synthetic users.
  Both requests returned 409, GitHub App installation required for this account. No production
  installation was borrowed. Two disjoint private projects, actual composer drafts, query saved copies,
  and IndexedDB read-back were therefore NOT verified. Existing owner adapter/cache tests do not replace it.
- Actual browser Back/BFCache journey, injected expired/5xx browser-token recovery, active runtime
  SSE/socket teardown, late asynchronous IndexedDB completion, and cross-tab legacy Supabase event
  acceptance remain UNVERIFIED. The synthetic pageshow event is not an actual BFCache navigation.
- The broader feature remains NOT YET shippable. This bounded milestone must not be marked accepted
  until the missing project/draft/IDB and lifecycle browser scenarios run. Parent UI/menu/preview/navigation
  and final reviews remain outstanding. No enablement claim is made.

## Account picker vertical, 2026-11-06

Status: UI vertical implemented locally; NOT accepted for enablement. No push, PR, merge, publish, or deploy.
Starting HEAD `a2ec666b91`; same canonical branch/worktree. Original untracked plan/research remain untouched.

### UI and contracts

- `features/auth/browser-logins/accounts.tsx` owns the shared Signed-in accounts section and isolated chooser/add page.
  Existing `AccountTopBar` header and sidebar Theme section compose it. Workspace switching stays separate.
  Current row has a checkmark/aria-current. Account rows and Open in new tab carry actual selector hrefs.
  Add keeps the sanitized destination. Five-account limit, roster loading/retry, expired labels and browser-only help exist.
- `/auth/browser-logins` handles password and actual broker email-code send/complete, explicit candidate confirmation,
  candidate/saved-slot TOTP factor challenge/verification, cancel and scoped single/all-browser removal.
  Password is React memory only. No Supabase credential writer or legacy signout runs for selected paths.
  All-browser removal calls the atomic broker removeAll through a host helper and invalidates the local roster.
- `/auth/browser-logins/callback` accepts only the initiating tab's matching sessionStorage attempt.
  It consumes that marker before code completion; confirmation follows factor verification.
  Google begin uses the server PKCE chooser URL. There is no linkIdentity or browser refresh credential.
- `GET /v1/auth/browser-logins/capabilities` returns only `{enabled}` from server vault availability and flag.
  SDK `browserLogins.capabilities()` uses the existing no-store cookie broker without a bearer.
  No query parameter enables the feature. Add disappears when disabled; saved roster/removal/recovery remain.
- Middleware resolves bare protected/root URLs from the browser roster. Multiple identities go to the chooser;
  one can resolve automatically. Failed explicit selectors redirect to the neutral chooser without legacy fallback.
  `browser-login-navigation.ts` strips foreign selectors and origin escapes, preserves locale and safe app destinations.
- Header/project-selector settings/project/create hrefs carry selectors. Selected header/menu logout uses the host helper.
  AuthProvider's unavailable screen links to the chooser. Pending upstream revocation is stated without claiming success.
- Server closed event `auth_identity_operation` records successful candidate authentication with operation/outcome/surface.
  Metadata has no email, slot, browser handle or identity pair. Shared browser analytics remain disabled.
- SDK README/developer reference describe discovery and browser selection. Ordered catalog additions pass the catalog guard.
  Non-English entries currently use English copy; translation review remains required.
- Real TOTP testing found duplicate confirmation returned before required AAL2 enforcement. The guard now runs before
  duplicate lookup. The regression first returned 200 instead of 403, then passed after the fix. The learnings ledger records it.
- Export guards found three pre-existing additive managed-storage exports absent from both snapshots. Both snapshots now
  include adoptManagedStorage/detachManagedStorage/onManagedStorageAdoption. No exported name was removed or renamed.

### Local checks and real proof

All commands run from `/Users/jay/root/kortix/suna-multi-account-login-plan`.

- SDK RED: named browser-identity test failed on missing capabilities method. GREEN: 6 pass, 0 fail.
- `pnpm --filter @kortix/sdk test src/core/auth/browser-identity.test.ts src/root-canonical.test.ts
  src/index.isomorphic.test.ts src/package-exports.test.ts src/public-surface.test.ts src/public-type-surface.test.ts`:
  six isolated files, 43 pass total, 0 fail. Logs: output/picker-sdk-final.log.
- `pnpm --filter @kortix/sdk typecheck`: exit 0. `pnpm --filter @kortix/sdk run smoke:install`:
  packed ESM import/construction pass. Logs: output/picker-sdk-t0-last.log, output/picker-install-last.log.
- Named web run: browser-login-navigation.test.ts, browser-route.test.ts, browser-consumer.test.ts,
  browser-lifecycle.test.ts: 13 pass, 0 fail, 45 assertions. output/picker-web-tests.log.
- `bun output/launch-test.ts`: only vault.integration.test.ts and capacity.integration.test.ts,
  branch DB/local GoTrue: 14 pass, 0 fail, 114 assertions, 8.38s. output/picker-assurance-green.log.
  Includes controlled Google PKCE/chooser/callback boundaries, actual TOTP, five-account limit and removal races.
- Web/API typechecks exit 0. Changed web lint: 0 errors, 6 warnings (effect state/impure time).
  Header and API changed-file lint exit 0. Brand audit clean. Ordered catalogs check --base=HEAD passes.
  git diff --check passes. No full/package suite ran.
- Real T3 preview browser on own Next 17700/API 17708, branch DB and synthetic A/B. Both accounts entered through
  actual password inputs, reached identity confirmation and selected /u/<slot>/projects pages. No cookie injection.
  Same-context child tab created via window.open: A and B simultaneously render their respective identity.
  For each tab token HTTP status=200, visible identity=true, /auth/user subjectMatches=true.
  Bare /projects with two identities opens chooser preserving returnTo. Both selector hrefs are rendered.
- Wrong password displays a failure and roster count stays 2. Cancel calls candidate cancel and leaves saved rows.
  Candidate TOTP UI verifies actual local code (mfa/verify=200); Continue reaches verified B project chooser.
  Actual Google provider login was NOT performed.
- Controlled local flag-disable: Add hidden=true, rows=2; actual B remove=200 leaves chooser=true, rows=1.
  A remains visible and token status=200 with expected subject. No silent selection of A follows B removal.
- Header menu DOM shows Signed-in accounts, selected checkmark/aria-current, scoped settings and target=_blank hrefs.
  Sidebar instance shares that component but cannot be exercised without an accessible project.
- Actual broker email send from UI returns 200 and local Mailpit receives the synthetic email.
  Shared local GoTrue template contains only a magic link; it does not include a code. No shared auth config was changed.
  Completion using a delivered code remains UNVERIFIED. Existing broker integration proves generated OTP completion only.
- Synthetic screenshots: output/picker-desktop-chooser.png, output/picker-header-dark.png,
  output/picker-mobile-dark.png, output/picker-mobile-light.png, output/picker-desktop-flag-off.png.
  Mobile 390x844 DOM has horizontal overflow=false; both themes observed. Local demo: output/picker-demo.mp4.
  The demo shows chooser/add controls; it is not a complete recording of the A/B acceptance matrix.

### Local proof launchers and remaining acceptance

- Own test-only launcher: `bun output/launch-picker.ts`; Next: `bun output/start-consumer-next.ts`.
  These use branch DB, local GoTrue, fixed synthetic keyring and ports 17708/17700. No config-file enablement occurred.
  Fixture credentials/TOTP secrets are only in ignored output. Never commit them.
  The test API reads existence of output/picker-disabled: present disables Add, absent enables only that fixture process.
  This is not a product flag mechanism. Product flag remains default false and machine .env.local stays false.
- Remaining: delivered email code requires an isolated auth template containing Token, without changing shared GoTrue.
  Real Google chooser/provider exchange, full callback UI acceptance, forced typed429 UI and expired/foreign callback browser
  assertions remain unverified. Existing server tests do not substitute for these browser journeys.
- Remaining: accessible project/sidebar journey, runtime/preview isolation acceptance, native Electron parity, keyboard-only
  complete flow, all-browser concurrent removal browser journey, translated non-English copy and final parent reviews.
  Project creation remains blocked by the existing GitHub installation requirement; no security requirement was weakened.
- Parent owns preview/runtime acceptance and kickoff reviews. Do not enable the feature or claim overall completion.


## Preview explicit-authority hardening, 2026-11-06

Status: PARTIAL IMPLEMENTATION. SECURITY RELEASE BLOCKER remains open. No enablement claim.
Branch multi-account-login-plan; starting HEAD 9fa3072932. Work stays in the existing worktree.
Original untracked plan and security-research files remain untouched. No SDK or host UI changes.

### Threat model and implemented behavior

Two authenticated identities share a browser cookie jar but select different identities per document.
An existing principal preview cookie names sandbox and port, not the embedding document.
A request supplying another credential must never inherit that cookie's authority on credential failure.
Previously HTTP ignored explicit bearer authority when a cookie existed. WebSocket did the same.
An invalid HTTP navigation ticket also fell back to the cookie.

`resolvePreviewSession` now selects explicit tickets first, then explicit bearer/token/share credentials,
then ambient cookies only when the request supplies no explicit credential. Invalid tickets return 401.
Both HTTP and WebSocket use this resolver. Successful WebSocket navigation tickets use the same purpose-separated verifier.
Existing supported cookie-only legacy requests remain supported. Public-share capability semantics remain explicit.
This change DOES NOT establish identity-partitioned origins. A cookie-only B navigation to A's legacy host remains unsafe.

Residual same-origin XSS: code executing on the selected application origin can act as the selected document,
and can read document-accessible short-lived credentials. Origin partitioning cannot protect against that execution.
No refresh credential transport, auth bypass, security-policy disablement, schema change, or flag change was added.

### Verification

All commands run from /Users/jay/root/kortix/suna-multi-account-login-plan.
- RED: `bun test apps/api/src/sandbox-proxy/preview-origin.test.ts`: 44 pass, 3 fail; HTTP returned 200 instead of 401,
  and WebSocket accepted an invalid bearer with a valid cookie. output/preview-authority-red.log.
- GREEN, same command after implementation and updating two prior fallback-policy assertions:
  47 pass, 0 fail, 141 assertions, 91ms. output/preview-authority-green.log.
- `pnpm --filter kortix-api typecheck`: exit 0. output/preview-authority-typecheck.log.
- `pnpm --filter kortix-api exec eslint src/sandbox-proxy/preview-origin.ts src/sandbox-proxy/ws-proxy.ts
  src/sandbox-proxy/preview-origin.test.ts`: exit 0, zero errors; test file ignored warning.
  output/preview-authority-lint.log.
- `git diff --check`: exit 0. No full suite ran.

### Unfinished work and concrete fixture finding

The established `tests/src/fixtures/database-project.ts` exports createDatabaseProject and deletion helpers.
It seeds a synthetic private project and manager membership directly, under an explicit non-production fixture profile.
This is the supported next setup path for the earlier GitHub-installation 409; no external-provider outage was established.
The picker launcher serves app.fetch directly and therefore does not exercise the Bun preview-host dispatcher.
A real proof launcher must include the production preview HTTP and WebSocket dispatcher, not this shortcut.

NOT IMPLEMENTED: identity hostname grammar, length-safe encoding, SDK generation, edge ingress validation,
actor/ticket/host binding, shared-link partition behavior, live login-session cookie/ticket revocation,
and active runtime/PTY lifecycle teardown integration.
NOT RUN: real HTTP/WS preview authority proof, A/B project fixtures, cloud runtime prompts/transcript/files/billing,
iframe DOM/network/assets/redirects/WebSocket positives, actual terminal/download acceptance,
and project/sidebar/draft/IndexedDB reload/back/focus/BFCache acceptance.
No browser or cloud resources were created in this bounded change. No external-provider failure is claimed.
Production enablement remains blocked. Parent must not treat these isolated protocol tests as end-to-end acceptance.

## Identity-partitioned preview origins, 2026-11-06

Status: bounded implementation and local authority proof complete. Overall feature remains NOT YET shippable.
Canonical worktree: /Users/jay/root/kortix/suna-multi-account-login-plan; branch multi-account-login-plan.
No push, PR, merge, deploy, publish, flag enablement, or subagent. Original untracked plans remain untouched.

### Grammar and authority

- Selected local label: `p{decimal-port}-{sandbox-label}--i{partition}.localhost:{api-port}`.
- Selected deployed label: `{e}-p{decimal-port}-{sandbox-label}--i{partition}.{preview-base}`.
  `e` is d=dev, s=staging, p=prod, r=preview. Short environment prefixes preserve wildcard TLS/DNS.
  There is still exactly one wildcard label. Ports are 1..65535.
- Partition is the first 96 bits of SHA-256 over UTF-8 `kortix-preview-identity:v1:{verified-user-id}`,
  encoded as 20 lowercase RFC4648 base32 characters without padding. It is public routing information.
  It does not grant authority. Separate users produce separate origins for the same sandbox and port.
- Sandbox IDs retain their full identity. `sbx_` ULIDs use the existing lowercase/underscore-to-hyphen encoding.
  UUIDs use reserved `uuid-` plus 25 zero-padded lowercase base36 digits for the full 128-bit UUID.
  The API reverses that encoding before sandbox lookup. Names beginning `uuid-` are reserved in selected generation.
  Selected UUID and 30-character sbx labels fit at port 65535 in every environment (maximum sbx label: 62 octets).
  Longer unsupported labels throw; no sandbox ID is truncated. Empty, foreign, repeated or malformed partition suffixes grant nothing.
- SDK async `authorizePreviewUrl` derives the partition from configured getUserId only for selected getToken.identityKey.
  It sends the partitioned destination to the actual /p/ticket route. This covers iframe authorization and the existing
  open-tab/static-file authorization seam. Pure synchronous builders remain transport candidates, requiring authorization.
  Selected path-only/untrusted/missing-token requests fail closed. Selected iframe failures expose no legacy fallback URL.
  Selected callers cannot mint the shared path cookie through ensurePreviewSessionCookie. Static-file address comparison
  recognizes the authorized partitioned address. Reverse preview detection recognizes compact deployed environments.
- The API verifies the credential principal against the partition before minting cookies/tickets. Signed payloads carry
  identityPartition and loginSessionId alongside sandbox, port and user. Legacy or foreign cookies/tickets fail verification.
  Partition requests never read the ambient legacy __preview_session bearer cookie.
- HTTP and WS share resolvePreviewSession. Both check live auth.sessions ownership and browser-slot removal/expiry.
  Removed slots refuse even while GoTrue revocation is pending. DB failures fail closed. The existing ticket lifetime is 60 seconds.
  Cookie and ticket signing purposes remain separate. Cookies remain host-only: no Domain attribute was added.
- The edge recognizes compact environments and signs the entire public hostname, including partition.
  Signature tests change the partition and observe a different signature. No nested hostname labels were added.
- Public shares retain explicit capability semantics on legacy share origins. Public-share credentials cannot establish
  a private principal on partition origins. Same-origin app XSS can still act as saved identities; this is not a sandbox claim.

### Executed checks

Commands below ran from the canonical worktree. Logs and synthetic launchers remain in ignored output/.

- RED: SDK preview-partition.test.ts failed on missing partition module. API preview-session.test.ts accepted a legacy cookie
  for a partition target and failed the new denial assertion. Both are green after implementation.
- `pnpm --filter @kortix/sdk test` with explicit files: core/session/preview-partition.test.ts,
  core/session/preview-auth.test.ts, core/session/static-file-preview.test.ts, react/use-authenticated-preview-url.test.ts,
  core/session/preview-origin-trust.test.ts, index.isomorphic.test.ts, public-surface.test.ts, public-type-surface.test.ts.
  Eight isolated files: 73 pass, 0 fail. output/partition-sdk-final.log.
- `bun test apps/api/src/sandbox-proxy/preview-hosts.test.ts apps/api/src/sandbox-proxy/preview-session.test.ts
  apps/api/src/sandbox-proxy/preview-origin.test.ts infra/cloudflare/workers/preview-router/worker.test.mjs`:
  98 pass, 0 fail, 232 assertions. output/partition-api-final.log.
- SDK and API `typecheck`: exit 0. API changed-file ESLint: exit 0. Edge `node --check`: exit 0.
  `git diff --check`: exit 0. No full/package suite ran. No public exports or package versions changed.
- `pnpm --filter @kortix/sdk run smoke:install`: packed tarball imports and constructs; install smoke passed.
  output/partition-install-final.log.

### Real HTTP, WS, SDK and browser proof

- `bun output/launch-partition.ts` launches the production dispatchInbound under Bun.serve, with actual Hono routes
  and previewWsHandlers. It does not serve app.fetch directly. Own ports: API 17818, synthetic upstream 17819.
  It uses branch DB and real local GoTrue users/sessions. createDatabaseProject/createDatabaseSession seed a private
  project/session. Fixture account membership/owner role is synthetic. Only Platinum resolveIngress is replaced with
  the local upstream address; auth, ownership, ticket, cookie, dispatcher and forwarding boundaries remain real.
- Real selected SDK configureKortix + authorizePreviewUrl calls actual GET /p/config and POST /p/ticket (200).
  The resulting URL has the expected partitioned origin and a scoped ticket, without a bearer or refresh credential.
- Actual A-host ticket entry: 302; Set-Cookie exists and has no Domain. Deliberately sending A cookie to B host: 401.
  A legacy-host cookie deliberately sent to B: 401. A ticket and A bearer sent to B: 401. Copied bare A URL: 401.
  B WS handshakes with A cookie or A ticket: 401. A root asset: 200 / asset-ok. A redirect: 302 /asset.
  Actual A WS handshake and echo: success. Deleting the real login session makes A cookie and ticket return 401.
  output/partition-http-final.log ends PROOF PASS. Final fixture users/project and own listeners are removed. No cloud sandbox was allocated.
  The DB invariant retains established sandbox identity rows; direct fixture-row deletion is refused.
  Failed local retries can leave synthetic sandbox identity residue. Do not treat it as cloud teardown proof.
- Same-profile T3 browser loaded simultaneous A/B iframe origins on the synthetic fixture panel.
  A frame reported actual fetch('/asset') status 200 and text asset-ok through postMessage from A origin.
  A frame opened same-origin WS and reported browser-echo. B frame reported kortix:preview-state signed-out from B origin.
  Parent DOM contained two differently partitioned iframe origins. No browser cookie injection occurred.
  Preview snapshot timed out; assertions used page evaluation and origin-checked frame messages instead. Own tabs closed.
- Local fixture setup first exposed missing synthetic membership and duplicate external-ID fixture residue.
  The launcher now creates explicit membership/role and uses a unique external ID. No production GitHub installation,
  policy bypass, or auth weakening was used. Raw diagnostic data stays in ignored output/.

### Parent acceptance still required

- Deployed wildcard routing/TLS and edge release, cloud sandbox app/assets/redirect/WS, and complete selected UI journeys
  remain parent gates. This local synthetic browser panel is not the complete production app preview journey.
- Real browser broker-removal-to-preview refusal while upstream revocation is pending is not separately exercised here.
  Live login-session revocation is exercised through real HTTP; the additional broker-row check is implemented.
- Existing parent cloud prompt/transcript/files/billing, runtime teardown, drafts/IDB/BFCache, and other UI gates remain.
  The product feature flag stays default off. Do not claim overall feature completion or production acceptance.
