---
recorded: 2026-11-06T21:20:57Z
incident_date: 2026-11-07
---
# Forward verified browser handles on server-side authentication requests

**Rule:** Forward the browser vault cookie on server-side auth reads and local logout. Key only these explicitly supported routes by a verified handle; keep public credential attempts on the anonymous budget.

**Trigger surface:** Next server code calls SDK authUser or recordPlatformLogout while migrating or removing saved browser sign-ins.

**Incident:** 2026-11-07: review found the retirement route omitted the cookie on both SDK calls. Logout also lacked a handle-keyed edge path. These requests could spend one shared web egress auth bucket. The feature remained off; no rollout or outage occurred.

**Enforcement:** `apps/api/src/__tests__/unit-public-edge-rate-limit.test.ts` fails when verified browser logout uses the 30-request IP budget. Real Next/API acceptance observes cookie forwarding and a 300-request handle budget for both SDK paths; 35 retirement retries return 204. Invented-cookie and public credential budgets retain their separate negative tests.
