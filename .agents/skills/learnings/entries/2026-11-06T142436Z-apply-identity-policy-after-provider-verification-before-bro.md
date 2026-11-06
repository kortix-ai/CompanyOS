---
recorded: 2026-11-06T14:24:36Z
incident_date: 2026-11-06
---
# Apply identity policy after provider verification before browser confirmation

**Rule:** Check the verified provider identity against enforced SSO before confirming a browser slot. Retain denied sessions for revocation.

**Trigger surface:** Adding a provider authentication path to the browser login broker.

**Incident:** 2026-11-06: a controlled local Google exchange bypassed enforced SSO. The default-off feature was not deployed.

**Enforcement:** `apps/api/src/auth/browser-logins/vault.integration.test.ts`, enforced SSO alternate-flow regression.
