# Browser sign-ins: experimental operator and user guide

Status: local implementation; parent review and remaining browser acceptance required. Keep disabled outside isolated proofs.

## Configuration

The API reads these variables at process startup. Restart every API replica after changes.
`KORTIX_BROWSER_LOGINS_ENABLED=false` is the default. Set `true` only for an approved cohort.
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

Open the account menu, choose Add account, authenticate, inspect the verified account, and confirm.
Confirmation selects that account in this tab. Open another account in a new tab for independent use.
Five saved sign-ins are allowed per browser handle. Duplicate users reuse their saved slot.
Each account keeps its own projects, permissions, settings and billing. Accounts and billing are never merged.
Remove a saved sign-in to sign it out in every tab using that sign-in in this browser.
Remove all to sign out all saved accounts in this browser. Other devices remain signed in.
An upstream revocation failure is shown as pending. Local access is removed first; the server retries revocation.
Handles expire after 30 idle days or 90 absolute days. Authentication attempts expire after five minutes.
Use separate browser profiles on shared devices. Saved sign-ins share a cookie partition; they are not a device-security boundary.
Local HTTP cookies use the development cookie path. Cookies do not isolate localhost ports: use the worktree's configured origin consistently.

Profile/password edits and authenticator enrollment are explicitly gated for selected sign-ins.
Use the ordinary sign-in page and explicitly authenticate the account to edit. That route may already contain a legacy login:
verify the displayed account before changing settings. Manage browser sign-ins supports verification of an existing authenticator.
Browser push notifications and shared PostHog attribution remain disabled for selected sign-ins.
Check session pages for updates. No background notification delivery is promised.
Native clients are outside this initial feature. Existing extension and desktop legacy authentication behavior is unchanged.

## Measurement and acceptance

The closed event `auth_identity_operation` currently records successful candidate authentication:
`operation=authenticate`, `outcome=success`, `surface=browser`.
It does not measure confirmed additions, switches, switch attempts, or switch reliability.
Do not report switch adoption from this event. No paired identities, email, slot, handle, or credential enters its properties.
The approved proposal's switch metric remains a proposal. No rollout schedule or deployment exists.
See the implementation progress ledger for exact local acceptance and remaining limits.
