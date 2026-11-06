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

Round 2: APPROVE. S1 and S2 resolved; no new findings in changed behavior.
Reviewed head 4c8e0ac2bc. Reviewer inspected source/assertions and prior logs without rerunning unchanged tests.
Worktree and whitespace check clean. Usage not exposed. UI not scored in this backend recheck.

## Remaining acceptance

Controlled callback negatives, focus restoration, and mobile/theme captures are verified in the progress ledger.
A clean complete two-tab recording remains uncertified.
External Google provider sign-in and deployment are not claimed.
Council follows Sol approval. Available provider catalog currently exposes Codex and Claude; a third provider was not listed.

## Keyboard acceptance finding

K1: logout-dialog Escape restored focus to BODY (actual browser failure).
Fix in working tree: remember the initiating logout button; ConfirmDialog forwards Radix close-auto-focus.
Closing restores that connected enabled button, or the page heading if successful removal deleted it.
Frontend changed-file lint: exit 0, zero errors, five pre-existing warnings.
Real browser GREEN: Escape restores the identical trigger; successful B removal closes the dialog and focuses the heading.
Roster readback retains one account; its token POST returns 200. Full demo remains uncertified.

Round 3: APPROVE. K1 resolved; no new findings. Codex gpt-6.1-sol, medium.
Reviewer inspected the two-file focus diff, async removal flow and dialog primitives.
Pending state prevents dismissal and duplicate confirmation; failed removal retains the dialog.
Approval covers the focus fix; demo, external provider and deployed acceptance remain excluded.
Usage not exposed. No suites rerun.
