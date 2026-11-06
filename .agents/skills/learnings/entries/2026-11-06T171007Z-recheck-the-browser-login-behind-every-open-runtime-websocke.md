---
recorded: 2026-11-06T17:10:07Z
incident_date: 2026-11-06
---
# Recheck the browser login behind every open runtime WebSocket

**Rule:** Carry the verified login session into the WebSocket access check. Reject removed browser slots and revoked login sessions. Fail closed when that check fails.

**Trigger surface:** Opening a runtime terminal or a private preview WebSocket with a browser credential.

**Incident:** Local multi-login acceptance found that an established cloud PTY checked sandbox membership without checking its opening login. A removed saved sign-in could leave that socket authorized. The feature remained disabled by default. No deployment occurred.

**Enforcement:** `apps/api/src/sandbox-proxy/ws-login-liveness.test.ts` rejects the established socket after its login becomes unavailable. `ws-proxy-access-recheck.test.ts` verifies closure of both socket legs. The private cloud acceptance probe verifies actual PTY closure after broker removal.
