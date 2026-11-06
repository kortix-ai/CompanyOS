# Browser sign-ins: experimental operator and user guide

Status: local implementation; initial adoption of an existing ordinary sign-in is unfinished. Parent review and remaining acceptance are required. Keep disabled outside isolated proofs.

## Configuration

The API reads these variables at process startup. Restart every API replica after changes.
`KORTIX_BROWSER_LOGINS_ENABLED=false` is the default. Set `true` only on an approved deployment. This environment flag is not a per-user allowlist.
Set `KORTIX_BROWSER_LOGINS_ACTIVE_KEY=synthetic-key-v2` and
`KORTIX_BROWSER_LOGINS_KEYS={"synthetic-key-v2":"<BASE64_32_RANDOM_BYTES>","synthetic-key-v1":"<PREVIOUS_BASE64_32_RANDOM_BYTES>"}`.
These are synthetic placeholders, not working credentials. Each value must encode exactly 32 random bytes as standard base64.
Store real values with dotenvx; never commit plaintext keys. Missing or malformed key configuration disables credential operations.

Rotate by deploying both keys, selecting the new active key, and restarting replicas.
Keep old keys while any stored credential uses them. Removing an old key makes those credentials unreadable.
Do not destroy old keys during rollback. Keep the broker recovery and removal routes available.
Disabling additions preserves saved-account selection, verification, roster and removal.
Rolling back to code without recovery routes requires removing saved sign-ins first or restoring the broker build for recovery.

## Browser behavior

Open the account menu and choose Add account.
If this browser still uses an ordinary sign-in, authenticate that same account once to save it first.
The new vault session has a separate refresh-token family. The host then retires only the old browser session.
The form opens again for the additional account. Inspect each verified account and confirm.
Existing ordinary tabs can require account selection or sign-in again after their shared session is retired.
Tabs already using a /u/<slot> URL keep their own selection when another account is added or selected elsewhere.
Wrong-account authentication is cancelled before confirmation. Cancellation or failed authentication preserves the ordinary sign-in.
A bare legacy tab follows a saved slot only when their users match; a different saved user never replaces it.
The same-origin retirement route uses the SDK, never auth-js refresh or global sign-out.
Ordinary browser logout now uses local Supabase scope too, including with the feature off.
This deliberate scope correction prevents a legacy fallback from revoking concurrently created saved sessions or other devices.
A capability check cannot safely authorize global logout because another tab can save a session after that check.
An expired legacy credential loses its browser cookie; the route does not claim upstream revocation.
A failed retirement stays retryable before the additional-account step. Removal retires any matching legacy session first.
Confirmation selects that account in this tab. Open another account in a new tab for independent use.
Five saved sign-ins are allowed per browser handle. Duplicate users reuse their saved slot.
Each account keeps its own projects, permissions, settings and billing. Accounts and billing are never merged.
Remove a saved sign-in to sign it out in every tab using that sign-in in this browser.
Remove all to sign out all saved accounts in this browser. Other devices remain signed in.
An upstream revocation failure is shown as pending. Local access is removed first; the server retries revocation.
Handles expire after 30 idle days or 90 absolute days. Authentication attempts expire after five minutes.
Use separate browser profiles on shared devices. Saved sign-ins share a cookie partition; they are not a device-security boundary.
Local HTTP uses a port-specific vault cookie name. Cookies do not isolate localhost ports: use the worktree's configured origin consistently.

Profile/password edits and authenticator enrollment are explicitly gated for selected sign-ins.
Use the ordinary sign-in page and explicitly authenticate the account to edit. That route may already contain a legacy login:
verify the displayed account before changing settings. Manage browser sign-ins supports verification of an existing authenticator.
Browser push notifications and shared PostHog attribution remain disabled for selected sign-ins.
Check session pages for updates. No background notification delivery is promised.
Native clients are outside this initial feature. Keep the flag off on deployments serving unverified native/side-panel flows.

## Recovery and transient failures

Reauthentication of an existing identity remains available at five saved accounts. The server still rejects a sixth identity.
OAuth return destinations are bound to their attempt. A denied or replaced attempt cannot select a later password/email destination.
A normal in-flight refresh owner can briefly show Sign in again. This conservative recovery indication is accepted for the experiment.
An unreadable credential marks only its own row for recovery. Restore retained encryption keys before recovering an unreadable slot.

A verified, mounted tab survives transient background 429/503/network failures. The next check retries.
Initial validation, explicit revocation, and persisted-page restoration keep private content hidden until verification succeeds.
Authoritative 401/403/404 responses clear the affected document. A loading gate with no prior verified identity reports transient failures too.

Renewal/discovery requests with a cold well-formed handle share a 300/minute IP budget.
Only successful token/resolve or candidate authentication promotes a handle into the bounded per-replica verified budget cache.
Initialization and empty rosters never promote a handle. Ordinary authentication requests keep their existing IP budget.
The broker additionally limits token/resolve requests to 60/minute per handle. These are abuse budgets, not account quotas.
Legacy preview origins prefer a valid navigation ticket over an existing cookie, then fall back to the cookie.
Partitioned origins reject invalid explicit credentials. Already partitioned deployed URLs accept only their configured environment alias.

## Measurement and acceptance

The closed event `auth_identity_operation` currently records successful candidate authentication:
`operation=authenticate`, `outcome=success`, `surface=browser`.
It does not measure confirmed additions, switches, switch attempts, or switch reliability.
Do not report switch adoption from this event. No paired identities, email, slot, handle, or credential enters its properties.
The approved proposal's switch metric remains a proposal. No rollout schedule or deployment exists.
See the implementation progress ledger for exact local acceptance and remaining limits.

## Initial adoption exclusions and session scope

Saving an existing SSO/SAML sign-in or an account without email is unavailable in this release.
The chooser displays this limit and keeps the current sign-in active. Do not enable the feature for deployments that require these adoption paths until they are implemented and verified.
Security → Sign out other sessions remains the explicit way to end other sessions.
Those sessions include saved sign-ins of the same account in this browser. Independent accounts are unaffected.

## Release-note draft (unpublished)

Keep up to five accounts saved in your browser and choose an account for each tab.
When starting from an ordinary sign-in, authenticate that account once to save it before adding another.
Browser sign-out ends the current session. Use Security → Sign out other sessions to end other sessions.
Publish only after the provider, deployment and browser acceptance gates pass. The feature remains off.
