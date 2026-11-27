---
recorded: 2026-11-27T22:31:55Z
incident_date: 2026-11-27
---
# Give every recovery read a deadline that covers the response body

**Rule:** A read that recovery waits on (single-flight, coalesced, or guarded by a busy flag) has its own deadline that covers the response body. The HTTP client's default deadline ends at the headers. A body that stalls after them leaves the read pending for good, and every later recovery signal waits on it.

**Trigger surface:** Any SDK reader that coalesces re-reads into one in-flight promise or skips a read while one is busy: the session-log sync controller, sub-agent thread reads, older-page reads.

**Incident:** 2026-11-27. A prod session showed the user's messages without the assistant replies until a hard refresh, after the KRTX-4973 fix (#13200) was live. The stored log held every reply. One `GET …/log?live=1` whose body never finished held `liveRead` in `sync-controller.ts` forever: turn ends, their follow-ups, reconnects, resyncs and tab-visible signals made 0 further reads. Every stream frame missed after that stayed missing, and the optimistic user rows kept rendering. Reproduced in the browser on a local stack with a real box (stalled body plus muted runtime frames: no reply in 41 s, reply after refresh).

**Enforcement:** `source.test.ts` (a body that stalls after the headers fails at `SESSION_LOG_READ_DEADLINE_MS` and aborts the request); `use-session-log.test.ts` (a read that never settles gives up at its deadline and the reply recovers without a refresh).
