---
recorded: 2026-11-06T18:56:48Z
incident_date: 2026-11-06
---
# Verify browser identity handoffs and HTTPS logout at their real boundaries

**Rule:** Route saved-identity preview handoffs through SDK ticket authorization. Test HTTPS host-cookie deletion. Isolate renewal budgets by browser handle at every limiter. Keep standalone hydration scripts independent of module imports.

**Trigger surface:** Browser account routing, login/session refresh, preview authorization, logout and auth bootstrap scripts.

**Incident:** During the 2026-11-06 local feature review, a preview handoff bypassed identity partitioning. HTTPS remove-all threw after revocation. Shared rate limits redirected healthy selected tabs. The ordinary login script referenced unavailable module helpers. The feature remained off and no change was deployed.

**Enforcement:** Named recovery.integration.test.ts exercises HTTPS deletion and handle budgets through HTTP/PostgreSQL. unit-public-edge-rate-limit.test.ts covers renewal and verified-user-read budgets across handles sharing an address. browser-login-navigation.test.ts covers authorization destinations. managed-storage.test.ts rejects nested legacy selector matches. Actual browser proofs exercise focus retention, the served standalone hydration guard, and a principal-partitioned ticket payload. Existing selected-preview HTTP/WebSocket tests reject foreign authority.
