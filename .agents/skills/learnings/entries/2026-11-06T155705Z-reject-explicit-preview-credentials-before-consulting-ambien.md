---
recorded: 2026-11-06T15:57:05Z
incident_date: 2026-11-06
---
# Reject explicit preview credentials before consulting ambient cookies

**Rule:** An explicit preview credential takes precedence over ambient cookies. Invalid explicit authority fails closed on HTTP and WebSocket handshakes.

**Trigger surface:** Preview-origin requests, navigation tickets, and preview WebSocket upgrades.

**Incident:** Local security review on 2026-11-06 reproduced three authorization misses. Invalid bearer or ticket requests inherited a valid preview cookie. This fix does not resolve shared-host identity isolation.

**Enforcement:** `apps/api/src/sandbox-proxy/preview-origin.test.ts` rejects invalid HTTP bearer, HTTP ticket, and WebSocket bearer requests despite a valid cookie. The HTTP and WebSocket paths use one authority resolver.
