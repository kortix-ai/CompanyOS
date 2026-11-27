---
title: Compute as a connector (sandboxes on demand)
status: parked, intent only (2026-11-27)
owner: unassigned
updated: 2026-11-27
---

# Compute as a connector

## The intent

Marko, 2026-11-27, while the Humanoid identity connectors were being built:
"you could do even full SANDBOXES like this … in the future if we decouple
COMPUTE/SBX from Sessions … more dynamic sbx/compute that agent can get as
he needs, rn thing shall stay the same there."

Every other part of an agent's action space is becoming a Kortix-built
connector an agent adds and uses as it needs (authenticator, browser,
phone number, Toolbox, the Kortix API). Compute is the exception today: a
session has exactly one sandbox, and `session_id == sandbox_id`.

The intent: an agent can get more compute the same way it gets a second
browser copy. A connector account names a sandbox or a machine; `connect`
gives access to it; copies run at once; the gateway's rules, approvals,
call log and credits apply.

## Not now

Sessions keep their one sandbox. Nothing here is built. It becomes
possible when compute is decoupled from the session, for example after
`stateless-sessions/` (the sandbox is disposable, the session is its
workspace and transcript on a volume) and the Machine work in
`platinum-machines-apps/`.

## How it would look

- A Kortix-built connector, for example `kortix_compute`, served in-process
  like `apps/api/src/connectors/kortix-agent/` (browser.ts is the pattern:
  one account, a copy per need, state in the account credential).
- Actions: start a sandbox (size, template, volume), run, files, stop.
- Billing per second in credits; a cap per account.

## Pick up when

- A session can run without owning its sandbox, or
- a Humanoid needs parallel heavy work beyond one box.
