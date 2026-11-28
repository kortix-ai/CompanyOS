---
recorded: 2026-11-06T20:30:34Z
incident_date: 2026-11-07
---
# Preserve the existing browser identity during saved-sign-in adoption

**Rule:** Require fresh authentication before saving an ordinary browser sign-in. Never share its rotating refresh credential with the vault. Route a legacy tab to a saved slot only when their users match.

**Trigger surface:** Adding saved sign-ins to a browser that already has an ordinary Supabase session.

**Incident:** 2026-11-07: default-off local acceptance exposed a migration gap. Only the newly added identity entered the roster. A sole saved identity could then replace a different legacy identity on bare-route navigation. No rollout occurred.

**Enforcement:** `apps/web/src/lib/auth/browser-login-adoption.test.ts` rejects cross-user routing. Real local browser and HTTP acceptance verifies initial-account preservation, fresh session separation, wrong-account cancellation, cookie retirement, and scoped removal. Credential-family ownership remains an architectural constraint; never add a legacy import without a new design review.
