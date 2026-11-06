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

## Council round 1 and response

Two providers available; no third provider listed. Both high effort, tool-confirmed.
GPT Sol: CHANGES, code 7/10, UI 7.5/10. Claude Opus 5.5: CHANGES, code 6/10, UI 4/10.

- Sol C1: selected preview handoff now calls SDK authorizePreviewUrl, validates origin and port, and uses a partitioned ticket destination.
- Sol C2: route-segment matching preserves CLI authorize, Slack, Teams and preview handoffs with their queries.
- Sol C3: standalone hydration script uses guarded window.sessionStorage calls, never module helpers.
- Opus C1: HTTPS remove-all deletes the host cookie with Secure. Actual HTTPS-configured HTTP/PG test passes.
- Opus C2: focus/online and ordinary pageshow validate in the background. Persisted pageshow and explicit invalidation still hide private state. Coalesced background work never clears the mounted document.
- Opus C3: token/resolve budgets use handle hashes; selected links disable prefetch. The parent also found the outer edge limiter and verified-user read spent a shared address budget. Both now carry the exact vault cookie and use a handle budget. Cookie possession grants no additional authorization.
- Opus C4: legacy origins retain cookie precedence; selected origins keep strict explicit-authority rejection. Named HTTP/WS tests cover both.
- Opus C5: authoritative roster 401 deletes only this frontend's exact vault cookie and continues legacy authentication.
- Opus C6: roster computes needs_sign_in from encrypted refresh state; UI never mistakes access-token expiry for logout.
- Opus C7: retained the conservative durable refresh marker. Automatic expiry could replay a rotating credential. Roster now exposes reauthentication need, and that row opens Add account for verified recovery. No timestamp or automatic retry added.
- Opus C8: capabilities returns optional has_handle; hosts skip roster without it. Capability reads create no audit rows.
- Opus C9/C10: completion clears the email code; confirm/cancel consume the stored return destination.
- Opus C11: SDK storage selector anchors at the root or a supported locale. RED then GREEN boundary test.
- Opus C12: failed selected-menu removal displays an error inside its dialog.
- U1/U2/U3: reuse AuthFrame, grouped avatar/account rows, explicit Open, secondary overflow controls, translated validation screen, shared spinner/Button, polite success status and in-dialog errors. The validation gate lives below I18nProvider.
- U4: use the shared check icon. Declined catalog-wide renaming of existing translation keys as unrelated churn. Capture-menu placement remains a low-priority host-discovery follow-up; native/side-panel acceptance is not claimed.

Targeted evidence and remaining acceptance are in the implementation progress ledger.
No reviewer ran a suite or edited production source. Opus ran and deleted a throwaway Hono cookie reproduction.
No usage totals exposed. Feature remains off; no push, PR, merge, publish or deployment.

Budget hardening: only hashes of recently broker-verified or minted handles can partition the outer edge budget. A bounded 10,000-entry, ten-minute positive cache stores no raw handle and grants no authorization. Invented cookies remain on the anonymous IP bucket. The route still validates live handle/slot authority on every request. Cold replicas use the original IP budget until a broker success verifies that handle.
