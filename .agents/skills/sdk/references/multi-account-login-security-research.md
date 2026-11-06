> Archived research supporting the approved proposal. Current implementation evidence lives in multi-account-login-implementation-progress.md.

# Multi-account login (web): security research and design options

- Research date: 2026-11-06.
- Status: research only. No runtime code changed. No implementation decision is final.
- Identities in this file are synthetic: **identity A** and **identity B**.
- Scope: `apps/web` sign-in, the `@kortix/sdk` token path, and the API calls that
  the web app makes with a Supabase JWT.

## 1. Required V1 behavior

1. A signed-in user adds a second, independent sign-in (Google OAuth or email)
   without signing out.
2. The user sees a list of saved sign-ins and switches between them.
3. **Per-tab identity.** Tab 1 uses identity A. Tab 2 uses identity B. Each tab
   keeps its identity across reloads, navigations, SSR, middleware, API calls,
   SSE streams and token refreshes. Switching in one tab never changes another tab's selected identity.
   Removing a saved sign-in invalidates every tab using that sign-in.
4. A failed or cancelled "add sign-in" leaves every existing sign-in unchanged.
5. "Sign out of B" ends only B. "Sign out of all" ends all saved sign-ins on
   this browser.

Consequence of rule 3: **one shared, cookie-scoped "active identity" cannot meet
V1.** Cookies are scoped by host/domain and path, not by browser tab or port. Every request from every tab carries
the same cookie jar, so a cookie can name a set of identities but never the
identity of one tab.

## 2. Three different things named "account"

Keep these apart in code, UI copy and the data model.

| Term                    | Meaning                                                                      | Where it lives today                                               |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Provider identity       | One login method (Google, email) of one Supabase user.                       | `auth.identities`; linked with `linkIdentity()`                    |
| Independent user (A, B) | A separate Supabase `auth.users` row with its own session and refresh token. | One session in the Supabase auth cookie                            |
| Workspace account       | A Kortix billing/tenant account that a user is a member of.                  | `useCurrentAccountStore` (`kortix.currentAccount` in localStorage) |

- Multi-account login is about **independent users**. It is not identity linking.
  `linkIdentity()` attaches a provider login method to the current user; it does
  not provide independent sign-ins. This is not a general merge of two existing user records. Do not use it for this feature.
- Switching the workspace account (existing feature) stays inside one user.
  After this feature, the workspace selection must be keyed by user
  (`<user>:<workspace>`), or a tab for B can read A's selected workspace.

## 3. Verified current code paths (dev at research date)

Installed versions: `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0,
`@supabase/auth-js` 2.116.0 (`apps/web/package.json` declares `latest`; these are the lockfile resolutions).

| Fact                                                                                                                                                                             | Evidence                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Supabase session per browser, in one cookie (`sb-kortix-auth-token`, port-suffixed on localhost).                                                                            | `apps/web/src/lib/supabase/constants.ts`                                                                                                                    |
| The cookie is readable by JavaScript (not `HttpOnly`); `SameSite=Lax`, `Secure` on HTTPS.                                                                                        | `apps/web/src/lib/supabase/client.ts`, `panel-cookies.ts` `authCookieOptions`                                                                               |
| `createBrowserClient` is a singleton per document; its BroadcastChannel is named after the storage key, so every tab shares auth events.                                         | `@supabase/ssr` `dist/main/createBrowserClient.js` (`cachedBrowserClient`); auth-js `GoTrueClient.js` `new BroadcastChannel(this.storageKey)`               |
| A sign-in writes the same cookie. Any new sign-in (OAuth callback, OTP, password) **replaces** the current session in every tab.                                                 | `apps/web/src/app/(auth)/auth/callback/route.ts` calls `exchangeCodeForSession` / `verifyOtp` on the cookie-backed server client                            |
| Google OAuth start passes no `prompt` / `login_hint`. Google may silently reuse its current browser session.                                                                     | `apps/web/src/features/auth/google-signin.tsx`                                                                                                              |
| The PKCE verifier lives in cookie storage; auth-js 2.116 has per-flow verifier slots (`<key>-flow-<id>-code-verifier`) and an `experimental.appendPkceFlowIdToRedirects` option. | auth-js `lib/helpers.js` `pkceVerifierSlotKey`; callback route handles `pkce_code_verifier_not_found`                                                       |
| Middleware avoids refreshing on the server because a server-side refresh rotates a single-use refresh token whose `Set-Cookie` may not reach the browser (KRTX-2111).            | `apps/web/src/middleware.ts` (comment at the `isAuthRoute` branch); `apps/web/src/lib/supabase/session-cookie.ts`                                           |
| `/auth*` routes skip identity resolution in middleware.                                                                                                                          | `apps/web/src/middleware.ts` `isAuthRoute`                                                                                                                  |
| A user change triggers a full client reset (React Query, current-account store, persisted stores, localStorage prefix sweep, IndexedDB).                                         | `apps/web/src/features/providers/auth-provider.tsx` `adoptUser`; `apps/web/src/lib/utils/reset-client-state.ts`; `apps/web/src/lib/auth/identity-marker.ts` |
| Sign-out calls `supabase.auth.signOut()` with no scope → auth-js default `global` (revokes every session of that user, on every device), then retries `local`.                   | `apps/web/src/lib/auth/perform-sign-out.ts`, `sign-out-sequence.ts`; auth-js `signOut(options = { scope: 'global' })`                                       |
| Server half of sign-out: `POST /v1/auth/logout` calls GoTrue `/logout?scope=local` and marks `account_session_activity` rows revoked.                                            | `apps/api/src/auth/index.ts`; gate in `apps/api/src/middleware/session-gate.ts`                                                                             |
| Same-origin check on the sign-out route compares `Origin` host with `Host`/`X-Forwarded-Host`.                                                                                   | `apps/web/src/lib/auth/submit-auth.ts` `sameOriginRequest`                                                                                                  |
| Return path sanitizer: relative path only, rejects `//`, `\`, control chars, normalizes dot segments.                                                                            | `apps/web/src/lib/auth/return-url.ts` `sanitizeAuthReturnUrl`                                                                                               |
| The SDK client reads one token getter for the whole document.                                                                                                                    | `apps/web/src/lib/kortix-config.ts` (`getToken: kortixGetToken`)                                                                                            |
| The SDK has a framework-free session store with single-flight refresh (`createKortixSession`), refreshing through `/v1/auth/refresh`.                                            | `packages/sdk/src/core/auth/session.ts`; `apps/api/src/auth/headless.ts`                                                                                    |
| Sandbox preview auth sets a cookie after a first `?token=` request (`__preview_session`, `__kortix_preview`).                                                                    | `packages/sdk/src/core/session/url.ts`; `apps/api/src/sandbox-proxy/preview-session.ts`, `apps/api/src/middleware/auth-combined.ts`                         |

Preliminary search inventory (not an exact migration scope; includes unrelated/public navigation sites):
7 files import the server Supabase client, 16 import the browser client;
111 `href="/…"` literals, 32 `router.push|replace('/…')`, 75
`window.location.assign|href|replace` uses in `apps/web/src` + `packages/ui/src`.

## 4. Official sources

Supabase

- Server-side auth, Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Server-side advanced guide: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- User sessions (refresh tokens single-use, 10 s reuse interval, reuse detection revokes the session; HttpOnly cookies only feasible for server-only apps): https://supabase.com/docs/guides/auth/sessions
- PKCE flow (verifier stored at start; same browser; overlapping flows overwrite; flow id; code valid 5 min, single use): https://supabase.com/docs/guides/auth/sessions/pkce-flow
- `exchangeCodeForSession`: https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession
- `signInWithOAuth` (`queryParams`, `skipBrowserRedirect`): https://supabase.com/docs/reference/javascript/auth-signinwithoauth
- Signing out (scopes `global` / `local` / `others`; JS default `global`; access tokens stay valid until `exp`): https://supabase.com/docs/guides/auth/signout and https://supabase.com/docs/reference/javascript/auth-signout
- Identity linking (what this feature is **not**): https://supabase.com/docs/guides/auth/auth-identity-linking
- Google sign-in: https://supabase.com/docs/guides/auth/social-sign-in/auth-google

Google

- OpenID Connect (`prompt=select_account`, `login_hint`): https://developers.google.com/identity/openid-connect/openid-connect
- OIDC reference: https://developers.google.com/identity/openid-connect/reference

IETF

- RFC 9700, OAuth 2.0 Security BCP (PKCE for all clients; CSRF on the redirect endpoint; PKCE may serve as CSRF protection): https://www.rfc-editor.org/rfc/rfc9700

OWASP

- Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- HTML5 Security (no session identifiers in Web Storage): https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- Authentication: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

Verification note: the delegated researcher used search summaries. The parent
opened the official Supabase, Google, OWASP, and MDN pages and checked the
critical identity-linking, sign-out, account-selection, and browser-storage text.
Version-specific behavior still requires the real-surface proof in the plan.

## 5. What every design must carry per request

A per-tab identity has to reach each of these surfaces **without a shared
cookie deciding it**:

| Surface                                    | Today                                                 | Per-tab requirement                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Full navigation / reload (SSR, middleware) | Auth cookie                                           | The request itself names the identity: the URL must carry a non-secret identity selector; a custom header alone cannot cover plain navigation. |
| Client fetch to the API (`@kortix/sdk`)    | `Authorization: Bearer` from one document-wide getter | Getter per tab, bound to the tab's identity. Existing headers are reusable; retry and connection lifetime still require proof.                 |
| SSE / streaming                            | Bearer through the SDK                                | Same getter. A stream opened by A must close when the tab switches to B.                                                                       |
| WebSocket / PTY                            | `?token=` query                                       | Token of the tab's identity.                                                                                                                   |
| Sandbox preview iframes                    | Cookie set after a `?token=` request                  | **Open question.** A cookie on the preview host is shared by tabs. Two identities that open the same sandbox share one preview cookie.         |
| Token refresh                              | Browser auth-js, cookie storage                       | Exactly one refresher per (browser, identity). Duplicate tabs must not refresh the same refresh token in parallel.                             |
| Server actions / route handlers            | Server Supabase client from cookie                    | Must receive the identity from the URL or an explicit header, never from "the" cookie.                                                         |

## 6. Option A — server vault + opaque slot in the URL (recommended)

### Shape

1. **Vault.** The web server (or API) stores each saved sign-in as a row:
   `{ handle_id, slot, user_id, encrypted refresh token, encrypted cached access token, expires_at, created_at, last_used_at }`.
   Encrypt the refresh token at rest (envelope key from KMS / existing secret
   tooling). The browser never receives a refresh token.
2. **Browser handle.** One cookie, `__Host-kortix-vault`, `HttpOnly; Secure;
SameSite=Lax; Path=/`, holding a 256-bit random handle. Store only a hash of
   it server-side (OWASP Session Management). The handle names the **set** of
   saved sign-ins on this browser. It never names the active one.
3. **Slot.** A short, random, non-secret id per (handle, user), for example
   `/u/k3f9/projects/...`. The slot is meaningful **only together with the
   handle cookie**. A slot URL pasted into another browser resolves nothing
   and shows the account chooser. A slot is never a user id, email or account id.
4. **Middleware.** Parse `/u/<slot>/…`, load the vault entry for
   `(hash(handle), slot)`, verify the access token (`getClaims()` or JWKS),
   rewrite the request to the existing route (`/…`) and pass the identity to
   server code in an internal request header that middleware sets and strips
   from inbound requests. A URL with no slot: redirect to the last slot this
   tab used (client hint) or to the chooser. A slot that does not belong to the
   handle: `404` page, no oracle.
5. **Refresh.** The vault refreshes server-side, single-flight per
   `(handle, slot)` (row lock or advisory lock). This centralizes refresh ownership, subject to a cross-replica lock and revision checks: tabs never hold a refresh token, so they cannot reuse one.
   It avoids dependence on a refresh-token cookie write, because the new refresh token is
   written to the vault, not to a `Set-Cookie` that can be lost.
6. **Tab access token.** The tab's JS gets a short-lived access token from a
   same-origin route, `POST /u/<slot>/auth/token` (CSRF: `Origin` check plus a
   custom header). The token lives in memory only. The SDK getter for this tab
   calls that route when the token is within its refresh margin. API, SSE and
   WebSocket calls keep using `Authorization: Bearer` / `?token=` as today.
7. **Add sign-in.** Start the OAuth/OTP flow on a dedicated route
   (`/auth/add`). The callback writes the new session **into a new vault entry
   only after a successful exchange** and redirects to the new slot. It never
   writes the legacy auth cookie. A failure or cancel touches nothing, so the
   original sign-ins stay intact by construction.
8. **Switch.** Switching in tab 1 is a navigation from `/u/<slotA>/…` to
   `/u/<slotB>/…` (chooser picks a path). It changes nothing server-side, so
   tab 2 is unaffected.
9. **Sign out of B.** Tombstone B's saved sign-in, then reuse the existing `/v1/auth/logout`
   local-session revocation and bookkeeping once. Retain encrypted retry state
   if upstream revocation fails; do not claim it completed. Tabs on B's slot get `401` on the next token fetch and show "signed
   out of this account". **Sign out of all:** do that for every row, then
   delete the handle.

### Why this fits

- The identity travels in the URL, which every navigation, reload, SSR render
  and middleware call already carries.
- Refresh tokens leave browser-readable storage. Today an XSS reads the whole
  session, refresh token included (the cookie is not `HttpOnly`). After Option
  A an XSS can still act as the user while the page is open and can read a
  short-lived access token, but it cannot directly export a long-lived refresh token from the browser.
  Same-origin XSS can also invoke the broker for other saved identities; tabs
  are not a security boundary against malicious same-origin scripts.
  This is risk reduction, not XSS immunity.
- It matches the BFF direction OWASP describes for SPAs.

### Cost (large migration)

1. Every in-app link and imperative navigation must keep the `/u/<slot>`
   prefix (an initial 218 navigation occurrences, including public sites, plus computed hrefs; confirm the actual affected set). Next.js
   `basePath` is static and cannot do this. Needs one link/route helper and a
   lint rule that rejects a bare absolute app path.
2. All 7 server-client and 16 browser-client Supabase call sites move to the
   vault-backed identity. `AuthProvider`, `onAuthStateChange` consumers
   (notifications, analytics), MFA (`apps/web/src/lib/supabase/mfa.ts`) and the
   Chrome side-panel partitioned cookie need their own design.
3. MFA: the AAL level is a property of each session. Stepping up B must not
   affect A. Unknown how much `mfa.ts` assumes one session.
4. Client caches: React Query and in-memory stores belong to each document.
   Persisted Zustand data, localStorage, and IndexedDB are shared by origin. Today a user change
   **wipes** them (`resetClientState`). Under per-tab identity a wipe in tab 2
   would destroy tab 1's state. Every persisted key must be namespaced by user
   id, and the global reset on user change must be replaced by per-namespace
   eviction. This is the second-largest work item.
5. Desktop (Electron) and the mobile bounce flows in the callback route must
   keep working; desktop deep links need the slot or the chooser.
6. External links into the app (emails, Slack, invites, OAuth `returnUrl`) have
   no slot. They land on a chooser that preserves the sanitized return path.
7. Server-side storage and a crypto key for the vault; a cleanup job for
   abandoned handles (worker job per API conventions).
8. Rollout: keep the legacy single cookie as a migration source. On first visit
   with the flag on, move the legacy session into a vault entry, then expire
   the legacy cookie.

## 7. Option B — per-tab `sessionStorage` sessions + SSR-safe client gate

### Shape

- Each tab would need a direct `@supabase/supabase-js` client with
  `auth.storage: sessionStorage`, a per-user `storageKey`, and
  a tab-local active user. The SDK getter reads that client. The installed SSR browser factory ignores
  `auth.storage`; passing sessionStorage to that factory does not isolate tabs.
- SSR and middleware cannot see `sessionStorage`, so every identity-dependent
  page renders a neutral shell and the client gate fetches data after hydration.
  Middleware cannot authorize navigation anymore.

### Objections

1. **Tokens in Web Storage.** Refresh tokens sit in JS-readable storage. OWASP
   (Session Management, HTML5 Security) says not to do this. It is equal to
   today's exposure (the cookie is JS-readable), not better.
2. **Duplicate tabs copy `sessionStorage`.** "Duplicate tab" and
   `window.open` from the app copy the opener's `sessionStorage`. Two tabs then
   hold the same refresh token and refresh independently. Supabase allows reuse
   only inside the 10 s reuse interval or for the parent token; any other reuse
   is treated as theft and revokes **the whole session** (Supabase "User
   sessions"). Coordination must be proved for the chosen storage and channel keys.
   Installed auth-js 2.116 uses lockless refresh coordination by default and
   a BroadcastChannel keyed by storageKey; a null lock does not mean that
   coordination is absent. Do not infer that a custom Web Lock is required
   without testing the installed coordination against isolated storage.
3. **Lost on tab close.** `sessionStorage` dies with the tab. Persisting the
   saved list needs `localStorage` copies of every refresh token, which makes
   objection 1 worse and reintroduces the shared-storage race.
4. **SSR loss.** Every server component and route handler that reads the user
   today becomes client-only. Middleware redirects for signed-out users,
   locale/landing decisions and server actions lose identity.
5. **PKCE.** The verifier is written to the storage of the client that starts
   the flow. With `sessionStorage` the callback must return to the same tab;
   OAuth opened in a new tab or a mail link loses it.

Option B is cheaper to start but fails V1 on SSR/middleware and carries the
refresh-token theft heuristic as a live production risk. Not recommended.

## 8. Rejected

- **Shared "active identity" cookie.** Cannot express per-tab identity (§1).
- **Header-only slot selection.** Browsers cannot add a custom header to every
  plain navigation. A query selector is technically possible, but both query
  and path selectors need explicit propagation by link helpers. The proposed
  path grammar provides a consistent application routing namespace.
- **Supabase identity linking.** Adds provider login methods to one user (§2).

## 9. Cross-cutting security requirements (both options)

1. **Login CSRF / session swap.** An attacker must not plant identity C into
   the victim's vault. PKCE binds the code to the browser that started the flow
   (RFC 9700 allows PKCE as CSRF protection). Add a one-time `state`/flow id
   bound to the handle (auth-js per-flow verifier slots or a server nonce), and
   show the resulting identity on a confirmation step before it becomes
   selectable.
2. **Google account choice.** Pass `queryParams: { prompt: 'select_account' }`
   on "add sign-in", or Google can silently return the identity already signed
   in at Google (often A). Avoid automatically pinning the existing identity with a login hint;
   verify the provider actually presents the intended chooser. Re-adding an identity that is already saved must reuse its slot,
   not create a duplicate.
3. **Failed / cancelled add.** The callback must never write the legacy cookie
   or replace an existing vault entry on error, cancel, expired code, or a
   missing verifier. The current `pkce_code_verifier_not_found` resume path must
   be re-checked against the new route.
4. **Return path.** Reuse `sanitizeAuthReturnUrl`. Add: strip any `/u/<slot>`
   prefix from a returned path and re-apply the **new** slot server-side, so a
   crafted `returnUrl` cannot pin the next page to another slot.
5. **Same-origin writes.** Every vault route (`token`, `add`, `sign-out`,
   `switch`) is `POST` with an `Origin` check (`sameOriginRequest`) and a custom
   header; `SameSite=Lax` is defense in depth, not the control (OWASP CSRF).
6. **Cache and stream isolation.** Query keys, persisted stores and IndexedDB
   databases are namespaced by user id. An SSE/WebSocket opened for A closes on
   a switch to B in that tab. A server-rendered page for slot B must send
   `Cache-Control: private, no-store` and vary on nothing shared.
7. **Scoped vs global sign-out.** "Sign out of B" uses Supabase `scope:
'local'` for B only. The current default (`global`) also ends B on other
   devices; keep `global` only for an explicit "sign out everywhere". Access
   tokens stay valid until `exp` after revoke (Supabase docs); Kortix also checks session liveness in `apps/api/src/shared/jwt-verify.ts`
   through `jwt-liveness.ts`, beyond account activity checks. Verify all changed
   HTTP and long-lived connection paths; do not assume immediate universal revocation.
8. **Limits.** Cap saved sign-ins per handle (proposal: 5). Rate-limit the add
   route.
9. **Audit.** Log add, switch-is-not-logged (client only), sign-out-one and
   sign-out-all with user id and session id, never the handle.
10. **Shared devices.** "Sign out of all" must be one obvious control; the
    handle cookie must expire (proposal: 30 days idle).

## 10. Proof-of-concept gates (before any build commitment)

Run each gate on a worktree stack with synthetic users A and B. Record real
requests and results.

1. **G1 Rewrite.** Middleware rewrites `/u/<slot>/projects` to `/projects`
   with an injected identity header; a server component reads it; a forged
   inbound header is stripped. Assert with curl.
2. **G2 Per-tab.** Tab 1 on slot A, tab 2 on slot B. Reload both, open an SSE
   stream in each, call `/v1/accounts` in each. Assert each request's JWT `sub`
   (network log) matches its tab, before and after a forced token expiry.
3. **G3 Duplicate tab.** Duplicate tab 2 five times; force concurrent refresh
   (expire access token, fire requests in all tabs at once). Assert exactly one
   GoTrue refresh per identity and no session revocation.
4. **G4 Add failure.** Cancel at Google; return with a bad code; return after
   5 min; return without a verifier. Assert the vault and both tabs are
   unchanged.
5. **G5 Login CSRF.** Replay a callback URL started in another browser into
   the victim browser. Assert it is refused and the vault is unchanged.
6. **G6 Scoped sign-out.** Sign out of B in tab 2. Assert tab 1 (A) keeps
   working, B's session row is gone in GoTrue, B's other devices keep working.
7. **G7 Slot leakage.** Open a slot URL in a fresh browser profile. Assert the
   chooser, no user data, identical response for valid and invalid slots.
8. **G8 Cache isolation.** Switch tab 1 from A to B and back. Assert no A data
   renders under B (React Query, persisted stores, IndexedDB).
9. **G9 Preview iframes.** Open the same sandbox preview as A (tab 1) and as B
   without access (tab 2). Assert tab 2 is refused even though the preview
   cookie from tab 1 exists.

## 11. Unknowns

1. Whether the vault belongs in `apps/web` (Next.js route handlers) or in
   `apps/api` (`/v1/auth/*` already brokers GoTrue). Recommendation: `apps/api`,
   exposed through the SDK, per the "logic lives in the SDK" rule; the web
   middleware only resolves the slot. Not decided.
2. Preview-cookie behavior across identities (G9). Not inspected beyond file
   names.
3. MFA AAL handling per session in `apps/web/src/lib/supabase/mfa.ts`.
4. Side-panel (Chrome extension) partitioned cookie: whether it uses a vault
   handle of its own.
5. Electron shell: whether it should expose per-window identity or keep one.
6. The real number of computed in-app hrefs (grep counts only literals).
7. Whether `prompt=select_account` passes through Supabase to Google unchanged
   for this project's provider config (expected yes via `queryParams`; verify).
8. Performance: one vault lookup per navigation and per token fetch.

## 12. Recommendation

1. Build Option A. It is the recommended option for per-tab identity with existing SSR and
   server-owned refresh. Other URL-bound server-session designs are possible.
2. Treat it as a large, flagged migration in phases:
   1. vault + `/v1/auth` routes + SDK per-tab getter (no UI change, legacy
      cookie migrated into one vault entry);
   2. `/u/<slot>` routing, link helper and lint rule;
   3. per-user cache namespaces replacing the global reset;
   4. add/list/switch/sign-out UI;
   5. side panel, desktop, mobile bounce.
3. Do not start phase 2 until G1–G3 pass. Do not ship UI until G4–G9 pass.
4. Make no absolute security claim in the PR. State the residual risk: XSS on
   the origin can invoke the broker for saved identities available to that
   browser and read short-lived access tokens.

## Parent synthesis

The companion [product and implementation plan](multi-account-login-plan.md)
selects API ownership, conditional migration, scoped browser logout, a candidate
confirmation step, and Phase 0 gates including preview isolation. It supersedes
tentative route names and phase ordering in these research notes. No proof-of-concept
has run yet. Browser account switching cannot promise absence of security defects.
