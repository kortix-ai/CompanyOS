---
recorded: 2026-11-12T11:30:13Z
incident_date: 2026-11-11
---
# When Kortix sessions stop getting prompts on some boxes only, read the Platinum host edge's per-minute request log before debugging Kortix

**Rule:** A Kortix session reaches its box through Platinum: the gateway goes to `*.sbx.platinum.dev`, then the Platinum CP, then the edge proxy on the box's host. When sessions on some boxes hang and others work, find which Platinum hosts the hung boxes share, then read that host's edge: `journalctl -u platinum-edge-proxy` counted per minute. Zero forwarded requests in a minute while the unit is active means the edge is hung, not the guest. `infra/restart-edge-proxy.sh`, or `deploy-hosts.yml` with `edge_only=true` on that one host, restores it. The guest's own `/kortix/health` answering inside the box proves nothing about the path in.

**Trigger surface:** A report that sessions show "Gathering thoughts…" with no end, or queued messages fail with "the session's machine could not be reached", on some sessions only. Also any change to how Kortix reaches session boxes, or to Platinum's edge, route hints or `EDGE_*` secrets.

**Incident:** 2026-11-11, Kortix prod on Platinum prod eu-west.
- The edge proxy on 2 of 6 Platinum hosts hung every preview request for 17 min, from 18:37:53 until manual restarts at 18:52 and 18:54 UTC. That made 33 of 90 running boxes unreachable, every box on those 2 hosts.
- Kortix sessions there stopped receiving prompts. One went 9 min without a delivery. A user report found it; no alert fired.
- Kortix marked those prompts **delivered**. The prompt POST hit the proxy's 15 s attempt timer, and the proxy kept its dedupe claim because a timeout cannot prove the box did not take the body. `deliverWithRetry` re-sent under the same Idempotency-Key, the claim answered `200 {deduplicated: true}`, and `sendPrompt` read that as delivery. The box never had the prompt.
- Cause: Platinum prod never had a route-hint key, so every request was a Postgres lookup on the host, with no deadline. A PlanetScale connection reset hung those lookups for 490 s.
- Fixed in kortix-ai/platinum#3278 (a derived hint key, a 1.5 s bounded lookup, a routed health probe, a host watchdog, alerts) and kortix-ai/platinum#3279 (a staging→prod env key parity check).

**Enforcement:** On the Platinum side:
- `apps/edge/src/server.dbhang.test.ts` fails if a silent database can hang the edge.
- `platinum-edge-watchdog.timer` restarts a hung edge in about 60 s.
- alert-cron pages `edge_preview_failing` and `edge_routes_from_database`.
- alert-cron itself does not go blind when one check stalls (kortix-ai/platinum#3294). It runs 4 checks at a time. A check that does not answer keeps its last good value for 15 min, and `alert_checks_blind` pages after 2 blind runs in a row. Its 3 heaviest billing checks run every 3rd run (kortix-ai/platinum#3302), so they cost the region database 30 queries per hour, not 90.
- `infra/env.sh check` fails on staging→prod key drift.

On the Kortix side:
- kortix-ai/CompanyOS#12640: `continueSession` reads back every `deduplicated` answer before it closes a row. A dedupe answer is the proxy repeating its own claim, not the box saying it has the message. Tests: `queued-continue-inbox-delivery` (hung POST is re-queued, not delivered), `forward.test` (a hung upstream: 502, then `duplicate` without reaching the box).
- kortix-ai/CompanyOS#12654: a prompt parked as `runtime_unreachable` says "Waits for the session's machine to answer. Kortix keeps retrying." and no longer claims "Read at next step". Browser journey 61 seeds a parked row and asserts it.
- Still to build: an alert on a burst of prompt timeouts across many boxes (none exists in apps/api). It needs a prod baseline of proxy timeouts from the API logs first.
