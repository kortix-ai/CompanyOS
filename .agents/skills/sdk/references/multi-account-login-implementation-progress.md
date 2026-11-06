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
