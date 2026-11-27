---
recorded: 2026-11-27T17:25:18Z
incident_date: 2026-11-27
---
# Queue a fresh log read when recovery invalidates an in-flight snapshot

**Rule:** A reconnect, resync, foreground return or readiness transition must invalidate a pending history snapshot. Coalesce those signals into one fresh read after it settles, not into the old response.

**Trigger surface:** Shared SDK session-log synchronization and its single-flight page reader.

**Incident:** 2026-11-27, KRTX-4973 recurrence investigation. A held user-only snapshot swallowed recovery signals after assistant frames were missed. Three controlled regressions reproduce the mechanism; attribution to the reported production occurrence remains unverified.

**Enforcement:** `use-session-log.test.ts` parameterized pre-gap reconnect/resync/visible regressions; browser journey 34 held-page invalidation exercises persisted history and visible recovery.
