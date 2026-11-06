# Multiple sign-ins with independent browser tabs

Date: 2026-11-06. Status: archived approved proposal; implementation is tracked in multi-account-login-implementation-progress.md.
The proposed metric below is not implemented as switch telemetry. The current event records candidate authentication only.
Operational configuration and current limitations are in multi-account-login-operations.md.
User direction: ship initially behind a feature flag. Do not create a PR.
The flag defaults off. Server authorization must enforce it; hiding the menu alone is insufficient.
Existing saved sign-ins retain a secure recovery/logout path when adding accounts is disabled.
Canonical branch: `multi-account-login-plan`.
Worktree: `/Users/jay/root/kortix/suna-multi-account-login-plan`.
Research base: `963cd48c9f6b1ed4ac53067236bab7b7f4dbf1bc` (`origin/dev` when the worktree was created).

## 1. Product brief

**Job:** A person uses separate Kortix sign-ins and wants to keep both available without repeated logout and login.
The requested workflow includes identity A in one browser tab and identity B in another.
The present web authentication path stores one shared session, which cannot express that selection.
The request establishes this need; adoption volume has not been measured.

**Change:** Add a saved-sign-in list to the existing identity menu, with Add account and per-tab selection.
Each sign-in retains its own workspace access, permissions, settings, projects, billing, and session state.

**Reuse:** Extend the existing sidebar workspace menu and header user menu.
Reuse SDK authentication methods, the existing token getter seam, headless authentication routes, redirect sanitization, and session revocation.
Workspace switching already exists; it does not switch independent users.

**Durability:** Identity selection and permission isolation remain necessary regardless of model capability.
**Trust:** No previous identity's content may appear under a newly selected identity, including during loading or failure.
This is a release condition, not an eventual cleanup task.

**Metric:** One proposed event, `auth_identity_operation`, through the existing closed analytics event list.
Fields: operation (`add`, `switch`, `remove`), outcome, duration bucket, sign-in-count bucket, and surface.
The primary measure is successful switches / attempted switches. Proposed target: at least 99.5% after 200 attempts.
Canceled additions are a separate outcome, not authentication failures.
Never send email, names, route slots, browser handles, tokens, or pairs of identity IDs.
Do not merge analytics profiles because two sign-ins share a browser.

**Compatibility:** Preserve current single-sign-in behavior outside the enabled browser cohort.
Add SDK exports without removing or renaming existing names. Follow SDK publication automation; do not edit its version manually.

**Kill/review criterion:** Review the metric after four weeks with at least 100 enabled, consenting browser cohorts.
If fewer than 5% add a second sign-in, investigate discoverability and reconsider continued expansion.
Do not remove secure session storage because adoption is low.
The implementation owner schedules this review when the pilot starts. No schedule is created during planning.

## 2. Confirmed requirements and proposed defaults

Confirmed by the request:

1. Add another Google or email sign-in while already signed in.
2. Keep both independent sign-ins in the list.
3. Use different sign-ins in different tabs in the first release.
4. Produce a researched plan before implementation.

Proposed defaults for design review:

| Decision                 | Proposed behavior                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| First surface            | Web browser. Keep existing desktop, extension, mobile, and CLI login working.              |
| Active identity          | One identity per tab, explicitly carried in that tab's app URL.                            |
| Saved list               | Shared within the browser's existing cookie partition; never synced to other devices.      |
| Limit                    | Up to five saved independent sign-ins per browser handle. Enforce on the server.           |
| Add completion           | Show the authenticated identity; explicit Continue selects it in the initiating tab only.  |
| Duplicate sign-in        | Match the verified Supabase user ID. Reuse its existing row; do not compare email strings. |
| Sign out of this account | Remove that saved sign-in from this browser, including other tabs using its slot.          |
| Sign out of all accounts | Remove all saved sign-ins from this browser. Other devices remain signed in.               |
| Sign out everywhere      | Keep this separate from browser logout and require explicit wording.                       |
| Bare app URL             | One saved sign-in can resolve automatically; multiple sign-ins show the chooser.           |
| Shared link              | Preserve the destination, ask for an identity when needed, then check its access.          |
| Handle lifetime          | Proposed maximum 30 days idle and 90 days absolute; stricter existing policy always wins.  |

The saved list is a convenience for someone with control of this browser profile.
Tabs on one origin are not security compartments against malicious JavaScript or another person using that profile.
Use separate browser profiles for that isolation.

Out of scope: merging users, sharing credentials, combining credit balances, transferring ownership, granting workspace membership,
linking new Gmail API permissions, and adding a multi-login account picker to native mobile or CLI.
Google authentication does not grant Gmail access.
Existing MFA, SSO enforcement, invitation policy, and signup policy continue to apply independently to each sign-in.

## 3. Current implementation and reuse map

The following facts come from source inspection at the research base. They are not runtime verification.

| Existing source                                                                                                     | Observed behavior                                                                             | Required change                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/supabase/client.ts` and `server.ts`                                                               | Browser and server use the same named session cookie. Browser JavaScript must read it.        | Enabled tabs must resolve their chosen identity without replacing this global session.                             |
| `apps/web/src/features/providers/auth-provider.tsx`                                                                 | Authentication events publish the incoming session and reset state when the user changes.     | Consume an explicit tab identity lifecycle; roster changes must not switch other tabs.                             |
| `apps/web/src/middleware.ts`                                                                                        | Protected navigation resolves identity from the shared cookie. It avoids refresh near expiry. | Resolve an explicit identity slot before protected rendering.                                                      |
| `apps/web/src/lib/auth-token.ts`                                                                                    | A document token cache uses an epoch to fence stale token reads.                              | Reuse the fencing concept in the SDK adapter; bind token reads and retries to the originating identity.            |
| `apps/web/src/lib/kortix-config.ts`                                                                                 | One SDK configuration provides `getToken` and `getUserId`.                                    | Both must read the same tab identity snapshot. Keep one configured client per document.                            |
| `packages/sdk/src/core/auth/session.ts`                                                                             | Existing storage adapter, subscription, and per-instance single-flight refresh.               | Reuse public patterns; this alone does not coordinate refresh across server replicas or tabs.                      |
| `apps/api/src/auth/headless.ts`                                                                                     | Existing password, email, OAuth, and refresh routes broker GoTrue.                            | Extend server authentication with a browser session vault; do not duplicate credential validation in the web app.  |
| `apps/api/src/auth/index.ts`                                                                                        | `/v1/auth/logout` performs local GoTrue revocation and activity bookkeeping.                  | Reuse one revocation sequence. Do not revoke once separately and then call this route again.                       |
| `apps/api/src/shared/jwt-verify.ts` and `jwt-liveness.ts`                                                           | JWT verification also confirms session liveness.                                              | Verify coverage on all affected HTTP and long-lived connections; do not assume JWT expiry is immediate revocation. |
| `apps/web/src/features/auth/google-signin.tsx`                                                                      | OAuth start supplies no explicit account-selection prompt.                                    | Add-account flow requests Google account selection and verifies the actual returned subject.                       |
| `apps/web/src/app/(auth)/auth/callback/route.ts`                                                                    | Callback exchanges credentials through a cookie-backed client.                                | Separate candidate sign-in exchange from activation; preserve existing sign-ins on failure.                        |
| `apps/web/src/lib/utils/reset-client-state.ts`                                                                      | Clears query state, persisted stores, local storage, and all session IndexedDB cache entries. | Replace global deletion during switching with scoped detach, reset, and deletion.                                  |
| `packages/ui/src/internal/stores/current-account-store.ts`                                                          | Workspace selection persists under one origin-wide key.                                       | Scope selection to the document and user; changing B's workspace cannot change A's selection.                      |
| `apps/web/src/lib/device-caches.ts`                                                                                 | Query caches and saved copies already use user IDs, but cleanup has broader effects.          | Retain verified user namespaces; split detach from deletion and block late writers.                                |
| `apps/web/src/features/workspace/project-sidebar/workspace-switcher.tsx` and `features/layout/user-menu-shared.tsx` | Existing identity, workspace, and logout surfaces.                                            | Add one reusable sign-in section to both relevant menus.                                                           |
| `apps/web/src/lib/analytics/posthog-client.ts`                                                                      | Consented analytics persistence uses shared local storage/cookies.                            | Prevent cross-tab analytics identity changes and profile aliasing; use document-scoped identity attribution.       |

Lockfile versions: Supabase SSR 0.12.7 and Supabase JS/auth-js 2.116.0.
The installed SSR browser factory explicitly ignores `auth.storage` and uses cookie storage.
Passing `sessionStorage` to that factory is not an implementation of tab isolation.

## 4. Options and recommendation

| Option                                                    | Meets independent tabs with SSR?              | Main tradeoff                                                                                       | Decision                                                                                                |
| --------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Shared active-session cookie plus account menu            | No                                            | Smallest UI change, but each login overwrites the browser identity.                                 | Reject for the confirmed requirement.                                                                   |
| Per-tab client storage plus neutral client-rendered shell | Requires an extensive server-rendering change | Browser-readable refresh credentials, duplicate-tab coordination, and server actions need redesign. | Do not select for V1. A direct Supabase JS client is needed; SSR factory storage overrides do not work. |
| Backend vault plus route identity selector                | Yes, subject to Phase 0 proof                 | Requires storage, refresh coordination, routing, cache, and callback migration.                     | Recommended proposal.                                                                                   |

Recommendation: put the vault in `apps/api`, expose typed behavior through `@kortix/sdk`, and keep the web host thin.
This preserves the existing bearer-token contract for platform and session-runtime calls.
It does not require a second data client or a second runtime transport.
The first implementation milestone is a disposable proof of the difficult boundaries, not the menu.

## 5. Proposed architecture

### Browser handle and route selection

- A random 256-bit browser handle lives in a host-only `HttpOnly; Secure; SameSite=Lax; Path=/` cookie.
  Use a `__Host-` name on HTTPS. Local development needs a separate port-scoped name because cookies ignore ports.
- Store only a hash of the handle. The handle authorizes access to this browser's saved-sign-in set.
- Each saved sign-in has a random, non-secret slot. A proposed app URL is `/u/<slot>/projects/...`.
  Preserve the existing locale behavior; Phase 0 selects and tests the exact prefix placement.
- A slot carries selection, never authority. Resolve it only with the handle and a live saved-sign-in record.
  Never accept an arbitrary user ID, email, or token supplied as the slot.
- Missing, foreign, expired, and deleted slots return a neutral chooser or a uniform failure without account metadata.
  They must never silently fall back to another saved identity.
- A URL copied to another browser grants no access. Share-link actions strip this browser-local selector.
  Redact slots from telemetry and edge logs. Use a restrictive referrer policy.
- Middleware strips any inbound internal identity headers before adding verified request context.
  Server components and actions use that context, not the legacy cookie or a client-asserted user ID.
  Never inject a refresh token into a forwarded header or rendered payload.
- Add one identity-aware link/navigation helper. Apply it to app links, prefetch, redirects, downloads, forms,
  settings, billing returns, invitation acceptance, and authentication handoffs.
  Public/marketing routes and intentionally shared resource links retain their existing URL meaning.
- Private HTML, RSC payloads, roster responses, and token responses use `private, no-store`.
  Next/CDN caches must not reuse them across handles or slots.

### Storage and server ownership

Proposed server-only records, with names finalized during schema design:

1. Browser handle: hash, creation time, last activity, idle/absolute expiry, revocation state, and version.
2. Saved sign-in: handle reference, slot, verified user ID, auth session ID, encrypted token material,
   token expiry, AAL, status, last activity, and revision. Unique on `(handle, user)`.
3. Authentication attempt: handle reference, random attempt nonce, source slot, method, PKCE verifier,
   safe destination, expiry, and one-time completion state.

Use authenticated encryption with the existing approved secret infrastructure and a versioned key.
Bind ciphertext to its handle, slot, and user as associated data. Encrypt cached access tokens if persisted.
Database storage or logs must not expose plaintext tokens. Keep keys outside the database and tracked plaintext files.
Do not expose these tables through browser database access. Enforce server-only grants/RLS and retention.
Use existing user deletion policy to revoke and purge all related records.
Expired handles require bounded cleanup and upstream session revocation; deleting ciphertext alone is not revocation.

### Browser broker and SDK seam

Proposed same-origin API family: `/v1/auth/browser-logins`.
Use the existing web `/v1` proxy; verify that every ingress preserves required cookies and response headers.
The backend checks the configured trusted frontend origin, CSRF token, and handle ownership.
It must not trust arbitrary `X-Forwarded-Host` values.

| Operation          | Proposed contract                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| List               | `GET` returns this handle's slots, display identity, and sign-in-required status; never credentials. |
| Begin add          | `POST` creates an isolated attempt and returns a safe next step.                                     |
| Complete candidate | Validated OAuth/email completion produces a pending candidate, not a shared active cookie.           |
| Confirm candidate  | `POST` commits the verified candidate and returns its slot.                                          |
| Get tab token      | CSRF-protected `POST` for one slot returns its access token and expiry; never a refresh token.       |
| Remove one         | `POST` tombstones one slot and invokes the existing local-session revocation sequence.               |
| Remove all         | `POST` tombstones the browser set, revokes its saved sessions, and clears the handle cookie.         |

Proposed errors: `401` for expired browser authentication, uniform `404` for unavailable slots,
`403` for rejected origin/CSRF, `409` for expired/replayed attempts, `429` for limits, and `503` for temporary unavailability.
Return safe typed errors without upstream token material or identity enumeration.
List responses contain identity display data only for someone possessing this browser credential.
Do not persist that roster in analytics or shared public caches.

The SDK owns request types, broker methods, and the browser identity/token adapter.
The host supplies browser storage and navigation effects through explicit adapters.
Keep the framework-free core; preserve the public `getToken` contract.
The document holds only a short-lived access token in memory, bound to its selected slot and generation.
`getUserId` derives from the same verified identity snapshot.
Server rendering uses request-scoped resolution, never a mutable process-global active user.
Apply the same origin/slot binding to all existing server-action inputs and outputs.

### Refresh, concurrency, and failures

- Serialize refresh per saved session across API replicas with a distributed lock or equivalent DB coordination.
  Per-process single-flight is insufficient.
- Store the rotated pair with a revision check. A removed slot cannot be resurrected by a late refresh.
- Keep refresh ownership on the server. Enabled browser tabs must not run legacy Supabase auto-refresh for that session.
- Start with one upstream refresh attempt per token request. Honor explicit rate limits.
  Retry only outcomes whose safety is established against the pinned GoTrue behavior.
  Ambiguous network failures must not trigger blind repeated use of a rotating token.
- Preserve credentials on transient failures; return an unavailable state with Retry.
  Only an authoritative invalid/revoked-session verdict moves that slot to Sign in again.
- Reuse current bounded auth deadlines for interactive submits: 20 seconds upstream, 25 route, 30 browser.
  Phase 0 measures whether token reads need a tighter budget. Do not add unbounded UI waits.
- A full identity switch cancels pending reads and mutations, closes streams/sockets, detaches persisters,
  and replaces the document. The outgoing identity's token retry cannot acquire the incoming identity's token.
  Already accepted server operations remain attributed to the original identity; switching does not cancel an agent run.
- Cross-tab messages carry roster/revocation invalidation only. Never broadcast tokens or active selection.
  Recheck server truth after messages, focus, `pageshow`, and reconnect.

## 6. User flows

### Add account

1. Open the existing identity menu, select Add account, and keep the current sign-in intact.
2. Create a browser-bound attempt without overwriting the current slot or cookie session.
3. Show Google and the email methods already supported by this deployment.
   Google requests `prompt=select_account`; verify the outbound provider request in the proof.
   Do not request Gmail scopes or implement a separate identity provider.
4. For email, prefer entering the code in the initiating tab. A link opened elsewhere must not attach to another browser's vault.
5. Validate the returned identity, existing signup restrictions, SSO requirements, and required MFA.
   Do not select a provisional AAL1 session when policy requires AAL2.
6. Show the authenticated identity with Continue and Cancel. Store a new selectable row only after confirmation.
7. Continue navigates this tab to the new slot's permitted landing page. Other tabs retain their selections.
8. Cancel, denial, invalid code, timeout, or replay leaves all existing slots unchanged.
   Revoke and purge any abandoned candidate session. Deduplicate by verified user ID, including automatic provider linking.

### Switch or open another tab

1. List saved identities under Signed-in accounts. Show the active checkmark for this tab only.
2. Selecting an identity switches this tab. An explicit Open in new tab action opens its slot URL.
3. Show Sign in again for an expired slot. Reauthentication updates that slot only after verification.
4. Retain drafts under their originating identity and resource. Never transfer a draft or attachment to the new identity.
5. Land on the selected identity's remembered accessible workspace. If access changed, show its chooser or access error.
   Do not reuse the previous identity's project as an implicit fallback.
6. Reload, browser back/forward, BFCache restoration, and duplicated tabs retain the identity in their URL.
   New bare tabs with multiple saved sign-ins show the chooser.

### Sign out

1. Use distinct labels: Sign out of this account and Sign out of all accounts on this browser.
2. Removing B ends B's saved browser session in every tab using that slot. Tabs using A remain unchanged.
3. Do not silently activate A in a tab that just signed out of B. Show the remaining-account chooser.
4. Tombstone the server record before cleanup. Coordinate upstream revoke with retries and retained encrypted cleanup state.
   Never report complete upstream revocation when it failed.
5. Purge only B's private cached state and notification registrations. Do not unsubscribe A's shared browser push endpoint.
   Verify that service-worker notification clicks select the correct identity before opening private content.
6. Offline logout can clear the current display, but cannot prove server revocation.
   Show that limitation and a retry action; do not claim all browser sessions ended.

The current browser sign-out path can invoke Supabase's default global scope.
The new browser actions must explicitly use local-session revocation, preserving other devices.
[Supabase documents the scope distinction and access-token expiry behavior.](https://supabase.com/docs/guides/auth/signout)

## 7. Security acceptance criteria

| Risk                           | Required control and proof                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-user content or writes   | Identity-bound request generation; scoped caches/stores; authorization checks on actual API requests. Test private projects, billing, secrets, and messages.      |
| Foreign slot / IDOR            | Require handle membership and verified subject. A slot alone returns no private data or token.                                                                    |
| Login CSRF / callback replay   | One-time, expiring, handle-bound attempt; PKCE; correct provider state/nonce handling; confirmation. Test concurrent attempts and another browser's callback.     |
| Open redirect                  | Reuse `sanitizeAuthReturnUrl`; allowlisted callback origins; remove supplied slot selectors before applying the verified target slot. Test every redirect branch. |
| Refresh-token theft            | No browser refresh tokens; HttpOnly handle; authenticated encryption, key rotation, and redaction. Test exports, errors, logs, and browser storage.               |
| Session fixation               | Reject caller-chosen handles; establish/rotate credentials at privilege boundaries. Concurrent adds and handle rotation must preserve already open valid tabs.    |
| CSRF on broker operations      | Exact trusted origin, synchronizer token/custom header, appropriate Fetch Metadata checks, strict CORS; SameSite alone is insufficient.                           |
| Stale / revoked bearer         | Reuse live-session checks; test post-logout requests and established stream/socket behavior. Broadcast is an optimization, never the authorization gate.          |
| MFA / SSO bypass               | Preserve per-session AAL, enforced domains, and sensitive-operation checks. Verify stepping up B leaves A unchanged.                                              |
| Cache, BFCache, service worker | Scope all private cache/storage keys; validate before restoring; never cache token/roster responses.                                                              |
| Analytics contamination        | Per-document identity attribution, no aliasing A/B, no saved roster in analytics, same consent and host rules.                                                    |
| Preview cookies                | Prove a preview authorized as A cannot authorize B's tab. Shared cookie authority without explicit identity is a release blocker.                                 |
| Brute force / vault growth     | Bound five rows, attempts, credential submissions, and cleanup work; rate limit by handle and existing anti-abuse policy.                                         |
| Key/store outage               | Fail closed for private content without deleting otherwise valid credentials; show retry. Test decrypt failure and unavailable DB.                                |

Critical preview constraint: a cookie on a shared preview host cannot identify the embedding tab.
If current preview cookies bypass the selected identity, use identity-partitioned preview origins or an explicit request-bound authorization design.
Do not solve this by placing refresh tokens in iframe URLs. Resolve this in Phase 0 before committing to the full implementation.

Residual risks: same-origin XSS can call the broker and act through any saved identity the browser can access.
HttpOnly prevents reading the handle directly; it does not stop authenticated requests from malicious page scripts.
An in-memory access token remains readable to page scripts. Device compromise and browser-profile sharing remain risks.
This plan reduces credential exposure and defines verification gates. It is not a promise of zero security defects.

## 8. Implementation sequence and exit gates

All phases stay on this canonical branch. Separate reviewable commits are appropriate; partial cutovers must not become enabled defaults.
Only research has happened so far. The following are future implementation tasks after design approval.

### Phase 0 — prove feasibility before committing to the migration

- Inventory all browser/server Supabase consumers, auth-sensitive routes, link generators, stores, streams, previews, and notifications.
  The initial import inventory finds 23 non-test source files; computed imports and shared packages need a full inventory.
- Verify route rewrite, locale, real SSR, RSC navigation, prefetch, actions, and identity-header stripping with two synthetic users.
- Prove same-origin broker cookies through local and deployed ingress; isolate local ports and Chrome cookie partitions.
- Prove one refresh owner across two API processes and five concurrent same-identity tabs.
- Resolve preview-cookie authorization, MFA/SSO, handle rotation, and legacy-tab interaction.
- Select encryption/key ownership, cleanup mechanism, exact URL grammar, retention, and feature-flag ownership.

Exit: real requests and browser evidence establish independent identities across rendering, API, streams, and previews.
If preview or SSR identity cannot be preserved, revise the architecture before further implementation.
Produce a revised effort estimate only after this inventory and proof. A calendar commitment before that is unsupported.

### Phase 1 — backend session vault and SDK contract

- Load the migration and SDK skills. Prepare an isolated branch database before applying schema changes.
  The current research worktree deliberately uses the shared database and has applied no schema changes.
- Add additive tables, server-only grants, encryption/key rotation, cleanup, local revocation, and cross-replica refresh coordination.
- Add typed broker contracts through the SDK; keep web modules as adapters/re-exports.
- Implement isolated authentication attempts, duplicate-subject handling, and idempotent completion/removal.
- Write failing boundary tests first for exported SDK behavior, permissions, cryptography, and refresh races.

Exit: direct HTTP calls prove handle/slot authorization, candidate isolation, refresh rotation, and scoped revocation.
No new menu is visible yet.

### Phase 2 — per-tab navigation, state, and compatibility

- Add the identity-aware route/link adapter and request-scoped server identity resolution.
- Update the SDK token/user adapters, authentication provider, middleware, server actions, and callback consumers.
- Scope workspace selection, drafts, persisted stores, query caches, IndexedDB, subscriptions, notification state, and analytics.
- Split cache detach/reset from namespace deletion. Prevent a late old document from repopulating removed storage.
- Bind stream reconnect and mutation retries to the original identity. Close old tab connections during document switching.
- Migrate eligible legacy browser sessions with explicit ownership handoff; stop old refresh writers before transferring token material.
  Old bundles and open legacy tabs cannot keep rotating the same session. If safe handoff fails, require reauthentication.
- Keep native callbacks, desktop windows, extension panels, and self-hosted existing login behavior compatible.

Exit: A and B work simultaneously across reload, back/forward, expiry, and network recovery. Other-identity data never paints.

### Phase 3 — account list and authentication UX

- Use existing Kortix brand/design primitives and menu locations. Read the design skills before changing UI.
- Add one shared sign-in section with identity/avatar, active checkmark, expired state, Add account, and logout actions.
- Keep Switch workspace separate. Do not create a second competing account menu.
- Support loading, canceled add, invalid credentials, revoked session, limit reached, offline, retry, and empty-list states.
- Verify keyboard selection, focus restoration, screen-reader status, contrast, long display identities, and narrow layouts.
- Add translations through the established catalog procedure.

Exit: record the actual add, switch, two-tab, and logout journey. Assert network identity and visible state, not screenshots alone.

### Phase 4 — documentation, pilot, and delivery

- Update `packages/sdk/README.md` and the SDK sections in `apps/web/content/docs/developers.mdx` for additive public APIs.
- Add discoverable in-product help explaining saved browser sign-ins, per-tab selection, logout scope, and shared-device expectations.
- Prepare release copy: "Keep multiple accounts signed in. Choose an account independently in each tab."
  Do not claim merged workspaces, combined billing, stronger tab sandboxing, or absence of security issues.
- Add the single product event and verify consent, URL redaction, and independent attribution.
- Enable internal synthetic accounts first, then an opt-in pilot, then broader cohorts after measured evidence.
- Preserve a recovery mode for existing vault users when disabling Add account. A flag rollback must not revive legacy credentials,
  mix identities, or strand users whose old cookie was removed.
- Follow the contributing/create-pr workflow when implementation is ready. Attach the synthetic-data demo.
- After verified merge to dev, dispatch the dev deployment, confirm each changed surface serves the merge SHA, and repeat the journey.
- Production promotion requires explicit user approval and the release gates. Schedule the four-week product review when the pilot starts.

Exit: local and dev evidence, deployed SHA, demo, documentation, operating recovery steps, and an assigned product review date.

## 9. Targeted verification plan

Use synthetic users A and B with separate private accounts/projects and one shared project with different roles.
Also prepare a fresh browser profile, a second-device session for B, and a revoked/expired session.
Evidence stays in gitignored `output/` when it contains credentials or real identifiers. Published demos use synthetic workspaces.

| Scenario                                       | Observable result required                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Add B while A is active                        | Both appear; A's other tab remains A; only initiating tab selects B after confirmation.                                                  |
| Two tabs                                       | Each tab's `/v1/auth/user` result and protected API result match its selected subject.                                                   |
| Simultaneous real sessions                     | Send a synthetic prompt from A and B; assert transcript, resulting file, billing attribution, and stream belong to the correct identity. |
| Failed/canceled add                            | Existing rows, tokens, selected tabs, and visible data remain unchanged; candidate is cleaned up.                                        |
| Duplicate subject / automatic provider linking | One row for the verified user; no accidental account merge or duplicate slot.                                                            |
| Concurrent adds / replay                       | Attempts cannot consume another attempt's PKCE/state or select the wrong slot. Replay fails.                                             |
| Refresh and replicas                           | Concurrent requests across five duplicated tabs rotate once per session; no invalid refresh family or cross-user token.                  |
| Switch during request/stream                   | Old response, 401 retry, mutation, and stream cannot publish under or execute as the new identity.                                       |
| Unauthorized account/project                   | Real API refuses private B resources when A is selected, including a forged workspace identifier.                                        |
| Slots / forged headers                         | Foreign browser plus copied slot or forged identity header gets no token, identity metadata, or private HTML.                            |
| Logout one                                     | B's slot becomes unavailable in every B tab; A and B's second-device session still work.                                                 |
| Logout all browser accounts                    | All this handle's rows become unavailable; another browser is unaffected.                                                                |
| Stale bearer and sockets                       | Post-revoke requests are refused; existing connections follow the documented revocation policy. Measure the bound.                       |
| Cache isolation                                | Query data, drafts, current workspace, settings, IndexedDB copies, BFCache, and storage events cannot cross users.                       |
| Preview/terminal/files                         | B without access cannot reuse A's preview cookie, terminal connection, download link, or signed-resource authority.                      |
| MFA / SSO / deleted user                       | Per-identity policy is enforced. Disabled identity cannot recover through a stale slot.                                                  |
| Offline / 429 / 5xx / decrypt failure          | Safe retry UI; no automatic fallback to another identity and no false logout-success claim.                                              |
| Integrations and consent                       | CLI/mobile/desktop/extension callbacks retain their contract; notifications and analytics stay attributed to the correct identity.       |

Development commands will name only the affected test files. Examples already present:

```sh
pnpm --filter @kortix/sdk typecheck
pnpm --filter @kortix/sdk test src/core/auth/session.test.ts
pnpm --filter @kortix/sdk run smoke:install
pnpm --filter Kortix-Computer-Frontend test src/lib/auth-token.test.ts
```

Package names and file paths above were checked against the worktree; these are future implementation checks, not commands run in this research session.
New permission/crypto/broker boundary tests are selected individually when their files exist.
Run T0 checks only for touched packages. No package-wide or full release suite runs during development.
Use the real worktree HTTP routes and the prescribed browser tools for changed UI. Capture DOM assertions and sanitized network evidence.
The release suite runs only during the approved production promotion.

## 10. Open decisions and evidence limits

The user has decided per-tab behavior. The remaining defaults above are proposals, not approved implementation details.
Design review must confirm the vault architecture, browser-only initial picker, five-account limit, and browser-scoped logout labels.
Phase 0 must settle the preview design, exact locale/route placement, encryption service/key lifecycle, and old-tab migration protocol.
Verify deployed auth/session limits before assuming independent sessions for the same user remain supported.
No new feature behavior, browser journey, encryption scheme, migration, or deployment has been executed in this research session.
Current-source findings and official documentation support the proposal; runtime proof is still required.

## 11. Primary sources

- [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide): current browser/server cookie coupling.
- [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions): rotating refresh credentials and session controls.
- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow): browser-bound code exchange.
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking): provider identities can resolve to the same user; deduplicate by verified subject.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): account chooser request and identity validation.
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): cookie protection and session lifecycle.
- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): browser-bound request validation, including login CSRF.
- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage): per-tab lifetime and opener-copy behavior.

The accompanying [security research](multi-account-login-security-research.md) records alternative designs and research questions.
Where this plan clarifies the research, this plan governs the proposed implementation.
