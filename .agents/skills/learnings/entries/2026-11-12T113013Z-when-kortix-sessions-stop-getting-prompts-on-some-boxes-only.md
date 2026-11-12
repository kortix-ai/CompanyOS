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
- Cause: Platinum prod never had a route-hint key, so every request was a Postgres lookup on the host, with no deadline. A PlanetScale connection reset hung those lookups for 490 s.
- Fixed in kortix-ai/platinum#3278 (a derived hint key, a 1.5 s bounded lookup, a routed health probe, a host watchdog, alerts) and kortix-ai/platinum#3279 (a staging→prod env key parity check).

**Enforcement:** On the Platinum side:
- `apps/edge/src/server.dbhang.test.ts` fails if a silent database can hang the edge.
- `platinum-edge-watchdog.timer` restarts a hung edge in about 60 s.
- alert-cron pages `edge_preview_failing` and `edge_routes_from_database`.
- `infra/env.sh check` fails on staging→prod key drift.

Kortix: none yet. Enforcer to build: when a session's box stops answering, the Kortix UI and gateway should report "the session's machine is unreachable" within seconds, instead of "Gathering thoughts…" with no end.
