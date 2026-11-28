---
title: An agent's automation goes live only after its test, on every path
status: planned, not built (the kortixd half shipped: #13195, #13210)
owner: My Kortix / QualiLoop loop
updated: 2026-11-27
---

# An agent's automation goes live only after its test, on every path

## Problem

My Kortix must not put work live that runs unattended before a test run succeeded.
Today only one path enforces that: the `kortix_schedules` platform tool in kortixd.

- `automate` adds a kortix.yaml trigger with `--disabled`; `create` pauses an agent schedule right after.
- `resume` refuses until this session's test passed: a `run_now` whose run succeeded
  (#13195), and for an automation with no filter a dry run is not enough (#13210).

Any other path skips the gate. In Agent Evals on dev (2026-11-27, `company-setup-agency`,
local trial), a weekly report trigger went live with no run: a kortix.yaml trigger
`weekly-client-report`, `enabled: true`, never fired. The session's own tool calls
were not readable afterwards, but the trigger has a slug, so it came from
`kortix triggers add … --apply` run in the session's shell, which adds a trigger live
by default.

A kortix.yaml edit is not the gap: a session cannot push `main`, so a manifest change
reaches the workspace only through a change request a person merges.

## Options

| | What | Covers | Cost |
|---|---|---|---|
| A | Change the CLI and manifest default to `enabled: false` | every path | Breaks every developer kortix.yaml that relies on the documented default `true` |
| B | The API refuses, for a session token, to create an agent trigger enabled or to enable one, until a run of it succeeded after its last change; the error says what to do (add it paused, `run_now`, read the run, then enable) | every agent path (CLI, tool, API); people and developers unchanged | One API rule plus a "last succeeded run since change" read; kortixd's gate becomes a fast path for the same rule |
| C | Prompt only: My Kortix uses `kortix_schedules`, never `kortix triggers add` from the shell | My Kortix only | No enforcement |

## Recommendation

B, with C now as a stopgap. B puts the rule where every agent path passes, keeps the
documented default for people, and turns the kortixd check into a convenience that
matches the server. Open: whether a person's explicit "skip the test" reaches the API
as a flag only a person can set (the way `ASK_REQUIRES_HUMAN` works for asks).

## Pick it up

- Gate today: `apps/kortix-sandbox-agent-server/src/services/tools/platform/kortix_schedules.ts`
  (`untested`, `runNowOutcome`).
- Run outcomes: `TriggerRunSchema` in `packages/api-contract/src/index.ts` (`status`, `run_status`).
- Eval that shows it: `evals/my-kortix/automation-paused-until-tested`, `company-setup-agency`.
