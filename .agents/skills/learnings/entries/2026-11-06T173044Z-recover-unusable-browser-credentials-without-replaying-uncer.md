---
recorded: 2026-11-06T17:30:44Z
incident_date: 2026-11-06
---
# Recover unusable browser credentials without replaying uncertain refresh tokens

**Rule:** Replace an unusable saved session after verified reauthentication. Retain its old session for cleanup.
Revoke uncertain or expired credentials through the server-owned user/session pair, never by replaying their refresh token.

**Trigger surface:** Browser-login confirmation, removal, and revocation cleanup.

**Incident:** Pre-release Sol review found that confirmation reused an uncertain session and discarded its fresh replacement.
Removal also retained uncertain expired credentials indefinitely, preventing the same user from being added again.
No deployment or production exposure occurred. Exact-session deletion follows the existing SSO revocation pattern.

**Enforcement:** `apps/api/src/auth/browser-logins/reauth.integration.test.ts` exercises real HTTP, PostgreSQL and GoTrue.
Both regressions fail before the fix. After the fix, two tests pass with 23 assertions.
The old refresh credential fails, the fresh saved session works, and an independent device session remains valid.
