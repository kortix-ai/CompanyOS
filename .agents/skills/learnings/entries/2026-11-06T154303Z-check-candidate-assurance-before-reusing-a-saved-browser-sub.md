---
recorded: 2026-11-06T15:43:03Z
incident_date: 2026-11-06
---
# Check candidate assurance before reusing a saved browser subject

**Rule:** Enforce candidate assurance before duplicate-subject reuse during browser-login confirmation.

**Trigger surface:** Changing credential-vault confirmation or deduplication.

**Incident:** 2026-11-06, dormant local implementation. Duplicate confirmation returned a saved slot before checking required AAL2. A synthetic regression returned 200 where 403 was required. No deployment occurred.

**Enforcement:** `apps/api/src/auth/browser-logins/vault.integration.test.ts`, real TOTP test: a fresh password candidate for a saved MFA-required subject must return 403 before verification.
