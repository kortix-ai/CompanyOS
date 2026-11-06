# Multi-account login review ledger

Scope: canonical branch multi-account-login-plan, base c68799e4cf to working tree.
Review command: git diff c68799e4cf. No push, PR, merge, or deployment.

## Sol loop

Budget: three rounds; extend only for unresolved auth/security findings within the skill limit.
Provider/model/effort: Codex, gpt-6.1-sol, medium (tool-confirmed inherited settings).
Round 1: CHANGES. Code 6/10; UI not scored. Usage not exposed.

- S1 should, fixed: confirmation retains the stable slot but replaces expired, uncertain or refresh-owned credentials.
  The old verified session moves to the expired consumed attempt for cleanup.
- S2 should, fixed: removal revokes its server-owned user/session through auth.sessions deletion and activity bookkeeping.
  It never replays a rotating refresh token for logout authority. Other sessions remain untouched.

RED: named reauth.integration.test.ts, two failures reproducing S1/S2.
GREEN: bun output/launch-reauth.ts, two pass, zero fail, 23 assertions, 889 ms.
This launcher uses isolated GoTrue backed by the same isolated branch auth database.
Affected existing HTTP/PG tests: bun output/launch-sol-regression.ts, 14 pass, zero fail, 114 assertions, 6.26 seconds.
API typecheck and changed-file ESLint: exit 0. Source formatting applied.
No full or package-wide test suite ran. Private launchers/logs remain in ignored output/.

Round 2: pending focused recheck of S1/S2 and changed source.

## Remaining acceptance

Controlled callback browser matrix and final keyboard/mobile/theme/demo remain unverified.
External Google provider sign-in and deployment are not claimed.
Council follows Sol approval. Available provider catalog currently exposes Codex and Claude; a third provider was not listed.
