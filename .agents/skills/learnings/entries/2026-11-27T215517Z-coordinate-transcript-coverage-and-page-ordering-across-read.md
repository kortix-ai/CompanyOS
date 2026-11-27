---
recorded: 2026-11-27T21:55:17Z
incident_date: 2026-11-27
---
# Coordinate transcript coverage and page ordering across readers

**Rule:** Keep transcript ownership, stored-page coverage and successful-page ordering shared across readers. Bridge disjoint stored windows before advancing coverage. A runtime put or live-box tail does not prove durable coverage.

**Trigger surface:** Editing session-log synchronization, pagination, reader disposal or reconnect recovery.

**Incident:** On 2026-11-27, broader regression checks after PR #13200 reproduced disappearing shared-reader history and a reconnect retaining only 80 of 100 records. Independent review exposed delayed cross-reader box responses that erased newer recovered pages. PR #13217 preserves the scoped fixes; deployed behavior remains separately verified.

**Enforcement:** `packages/sdk/src/react/use-session-log.test.ts` covers two-reader disposal, staggered readers, disjoint windows, runtime tails, box/journal lag, failed bridging and delayed cross-reader responses. Foreground tests cover exhausted initial reads and pagination retries. Recovery still requires a later signal after journal catch-up; these tests do not prove universal convergence.
