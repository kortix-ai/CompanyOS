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

## Council round 2 and final response

Reviewed head b804810f3b. GPT Sol: CHANGES, code 8/10, UI 9/10. Claude Opus 5.5: CHANGES, code 7/10, UI 7/10. Both high effort; usage not exposed.

- Sol-C1: preview recovery accepts only the configured environment's long or compressed prefix, with the same exact scheme/domain/port checks. Named deployed partition URL test covers acceptance and foreign-environment/port rejection.
- Sol/Opus-C7: explicit reauthentication remains available at five accounts; backend still rejects a sixth. Actual browser recovery preserves five slots. Actual sixth confirmation returns 429 and candidate cancellation returns 200.
- Sol/Opus-C10: OAuth return state is JSON bound to its attempt; new password/email attempts capture the current destination and clear old state. Denial clears stored state. Browser denial followed by password recovery lands on current settings destination, not stale CLI consent.
- Opus R2-C1: legacy valid ticket wins over cookie, invalid ticket falls back to cookie. Signed ticket B plus cookie A now mints B's cookie. Selected strict authority behavior stays intact.
- Opus R2-C2: transient background errors preserve a verified mounted document. Cold/initial or explicit-hidden failures show the gate. Own SDK invalidations stay suppressed for the entire async validation. Changed identity keys still hide; ordinary token invalidations validate in the background. Queued validation preserves hidden work and ignores disposed/stale failures.
- Opus R2-C3: initialization/roster successes do not promote rate budgets. Only successful token/resolve/complete can promote authenticated handles.
- Opus R2-C4: cold well-formed handles use a separate shared 300/minute IP budget; rotating fabricated or empty handles cannot split it. Authentication/password budgets stay unchanged.
- Opus R2-C5: roster decryption failure marks only that row needs_sign_in. Real HTTP proves sibling discovery/token and initialization remain usable. Unreadable ciphertext still requires restoring retained keys; no refresh credential is replayed.
- Opus R2-C6 accepted: a normal in-flight owner can briefly display Sign in again. Operations guide records this conservative indication. No automatic owner expiry added.
- Opus R2-C7: gate manage link retains the selector-free current destination and query. Actual error-gate browser assertion verifies it.
- U1/U2/U3/U4: truncate with full title, shared desktop logo/auth heading, remove duplicate middot subtitle, omit agreement footer in account management.
- U5: current light/dark artifacts include validating gate, error gate, overflow menu, remove dialog and in-dialog error. Needs-sign-in and desktop/mobile layouts are also captured. Synthetic accounts only.
- Parent navigation check: bare Slack/Teams marketing pages remain public; only install/login handoffs acquire selectors. RED then GREEN named route test.

Final-round checks and bounded acceptance remain in the progress ledger. No push, PR, merge, publication or deployment. Flag stays off.

Final council round deferred: original-requirement inspection found that ordinary legacy A is not imported into the vault before B is added. Preserving A's cookie is insufficient to list both accounts. The approved migration design remains unimplemented. Keep the flag off while this handoff is researched, implemented and verified.

## Final council preparation after adoption, 2026-11-07

The original already-signed-in adoption gap is implemented and locally verified under engineering ruling 1. The progress ledger names real HTTP, PostgreSQL, browser and video results. All round-2 findings have responses in the prior sections. Fresh authentication avoids transferring a rotating credential from old bundles. Legacy routing follows only the same saved user. An uncertain saved current identity is repaired first, and a token failure leaves the ordinary session intact.

Ordinary sign-out intentionally changes to local Supabase scope even with the feature off. This prevents global revocation of a concurrently created saved session. An outer capability check cannot eliminate that race. No design relies on a cross-tab acknowledgement to control old code.

Round 3 must assess code and the captured chooser, gate, dialog, mobile/theme and first-adoption states. Genuine external Google, deployed TLS/edge, persisted BFCache, combined delayed callback and native acceptance remain excluded. Do not infer production approval from local results. Two providers are available; no third provider is claimed. No PR or publication is authorized.

## Council round 3: Opus and subsequent corrections, 2026-11-07

Claude Opus 5.5, high effort: APPROVE for default-off stage only. Code 8/10, UI 8/10 at e1a22d5e44. Read-only source and ten screenshots; video frames inspected. No suites or browsers run. The UI target of 9 from every reviewer was not met. The three-round cap prohibits another Opus round. Sol round 3 has not run: its first request rejected an unsupported option before creating a child. The retry uses supported reasoningEffort=high.

Corrections after the Opus review:
- F1: retirement forwards the vault cookie on authUser through its SDK fetch adapter and on recordPlatformLogout through supported headers. Ordinary server finalization also forwards cookies. POST auth/logout joins the verified handle budget. Real Next/API proof observes 300 on both paths and 35 retirement retries returning 204. The targeted edge regression first failed, then passed.
- F2: a working ordinary identity follows only a matching saved slot that does not need sign-in. Otherwise legacy verification continues. New named regression and real ordinary A plus uncertain saved A proof pass.
- F3: five-account notice remains visible on direct add=1. Confirmation capacity errors map to the capacity explanation, not the rate retry message. Real sixth-account confirmation preserves five slots and displays the correct explanation.
- F4/F5: stale-session cleanup uses local scope. Sequence comments describe two local attempts with a bounded transient-failure retry.
- F6: SSO/SAML and email-less initial adoption show an explicit unavailable notice and preserve the ordinary sign-in. These paths remain outside this release. A controlled SAML metadata UI check passes; no genuine SAML authorization is claimed.
- F7: a named permission-decision test rejects unrelated and missing ordinary identities. The route still verifies the bearer separately.
- F8: adoption Cancel retains its attempt-bound return destination after callback URL cleanup. Actual controlled expected-A callback → Cancel reaches the original profile page with the ordinary cookie intact.
- F9 remains accepted and documented: expired ordinary credentials lose the cookie; upstream session revocation is not claimed.
- U1–U6: full-width form actions, visibly disabled current email, adoption-specific heading, specific removal error in destructive styling, muted capacity notice, gate logo and heading. Updated desktop/mobile light/dark and dialog/gate screenshots are in ignored output.

Video correction: the original 49.7-second video and subsequent agent-browser captures are uncertified. They freeze or omit transitions. Their DOM/network assertions remain separate evidence. A Playwright CLI recording captures the actual management form, modal failure, successful removal, remaining A, and A profile. The edited account-management-demo.webm removes an idle interval using raw ranges 0–26 and 172–176.067 seconds. Contact sheets were visually inspected. This is a single-page UI walkthrough, not a raw two-tab recording. No claim of certified full two-tab video remains.
