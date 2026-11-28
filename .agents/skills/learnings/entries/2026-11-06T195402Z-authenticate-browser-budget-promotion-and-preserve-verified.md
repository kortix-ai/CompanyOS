---
recorded: 2026-11-06T19:54:02Z
incident_date: 2026-11-06
---
# Authenticate browser budget promotion and preserve verified tabs during transient failures

**Rule:** Promote browser-handle budgets only after authentication succeeds. Keep cold handles on one bounded IP budget. Preserve an already verified document on transient background failures, but surface failures when no verified document exists. Preserve valid-ticket precedence on legacy preview origins.

**Trigger surface:** Browser sign-in ingress, session renewal, preview credential handoffs, and client identity revalidation.

**Incident:** During the 2026-11-06 local feature review, unauthenticated initialization promoted handles into separate authenticated rate budgets. Background transport failures reset working tabs. Legacy preview cookies also overrode new valid tickets. The feature stayed off and no deployment occurred.

**Enforcement:** Named recovery.integration.test.ts proves newly minted empty handles cannot split the cold IP budget. unit-public-edge-rate-limit.test.ts bounds fabricated handles and isolates authenticated handles. preview-origin.test.ts proves cookie A plus ticket B mints B's cookie. browser-lifecycle.test.ts covers verified background failures, cold queued failures and disposed requests. Real browser proofs cover token503 retention, gate retry, preserved destinations, and an in-dialog removal503.
