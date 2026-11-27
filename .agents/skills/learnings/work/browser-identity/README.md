---
title: Browser identity on volumes, with a merge that repairs divergence
status: parked (2026-11-27), next after the kortix-surface refactor, together with a Platinum Browsers refactor
owner: unassigned
updated: 2026-11-27
---

# Browser identity on volumes

Marko, 2026-11-27: Kortix Browser becomes one of the most important
connectors. Browsers need persisted configuration (Chrome-profile style:
load a profile, start from it), and when several agents start several copies
and they diverge, a merge repairs it.

## What exists (connectors/kortix-agent/browser.ts)

- One identity per account: a Platinum saved profile (cookies and
  localStorage, up to 4 MiB) plus stored site logins.
- A copy per session, started from that profile; up to 10 at once.
- `save_login` merges one site's cookies and storage from a copy into the
  identity (`mergeSiteState`): copies that save different sites never
  overwrite each other.
- Lost: IndexedDB, service workers, extensions, settings, partitioned
  cookies; a copy that never calls `save_login` keeps its new logins to
  itself.

## Target

- The whole Chromium profile on a Platinum volume (versioned, restorable,
  forkable; `docs/volumes.md` in the platinum repo): the primary has the one
  exclusive writable mount, each copy runs on a fork of the volume's head.
- A merge back from a copy into the primary, per site and per store
  (cookies by name, domain and path; localStorage and IndexedDB per origin),
  run on `save_login`, on pause and on release, so divergence repairs
  itself instead of waiting for an agent.
- Named profiles a workspace can load (a "work" and a "personal" identity),
  like Chrome profiles.
- Platinum changes: `profile_volume` on browser create, create from a fork,
  delete the Chromium `Singleton*` lock files on start, save on pause and on
  idle, a sticky residential IP per identity, a captcha solver by default.

## Pick up when

The kortix-surface refactor (catalog, connector, SDK, MCP, CLI) has landed.
