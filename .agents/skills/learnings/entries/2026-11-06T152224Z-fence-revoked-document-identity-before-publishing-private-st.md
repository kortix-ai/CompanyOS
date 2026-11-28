---
recorded: 2026-11-06T15:22:24Z
incident_date: 2026-11-06
---
# Fence revoked document identity before publishing private state

**Rule:** Revalidate saved identities on focus, pageshow, reconnect, and a bounded heartbeat. Fence stale completions. Hide private children and stop document-owned connections on rejection. Treat network failures as retryable. Never adopt a legacy cookie for a selected document.

**Trigger surface:** Browser saved-identity authentication and persistent client state.

**Incident:** A synthetic local acceptance test removed a saved identity successfully. Its token endpoint returned 404, but its existing DOM still displayed that identity. No production exposure is claimed. The local regression now clears the DOM after bounded broker validation.

**Enforcement:** `apps/web/src/lib/auth/browser-lifecycle.test.ts` covers stale publication, coalescing, terminal rejection, and transient retry. `packages/sdk/src/platform/storage/identity-storage.test.ts` covers owner isolation and detached writers. Real local browser evidence remains in ignored output. Complete private-project acceptance remains outstanding.
