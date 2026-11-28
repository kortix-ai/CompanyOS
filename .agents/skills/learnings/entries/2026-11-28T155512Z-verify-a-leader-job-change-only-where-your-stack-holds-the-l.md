---
recorded: 2026-11-28T15:55:12Z
incident_date: 2026-11-28
---
# Verify a leader-job change only where your stack holds the leader lease

**Rule:** Before you call a change to a leader job verified on your local stack, check who runs it: `select owner_id from kortix.worker_leader_lease where lock_key = 'background-workers' and expires_at > now()`. Its pid must be your stack's API (`readlink /proc/<pid>/cwd`). Leader jobs include the eval runner, schedules, triggers and the other `worker/jobs`. If another stack holds the lease, create the worktree with `--db`, or verify on dev after the deploy.

**Trigger surface:** You change code that only the leader runs (`apps/api/src/worker/jobs/*`, `projects/evals/runner.ts`, a scheduled tick), then run it on a worktree created without `--db`. The same applies to an eval trial whose session you then read: the leader creates that session, with its stack's `KORTIX_URL`.

**Incident:** 2026-11-28, branch `qualiloop`. A runner change that saves the trial's session log produced no file in two local trials. The `background-workers` lease was held by another session's worktree on the same shared database. That stack's API ran every local eval trial on its own branch's code, so the change never ran. Local checks of My Kortix prompt changes earlier that day may have run through the same stack (the lease holder then was not recorded), so they count as unproven until the dev run. `pnpm worktree start` had printed the shared-DB warning, but it named only the work queue.

**Enforcement:** partial. `pnpm worktree start` now also says that leader jobs run in the one stack holding `kortix.worker_leader_lease` and are not tested here (`warnOnSharedDbCrosstalk`, `scripts/worktree/cli.ts`). None yet: a start-time check that names the lease holder's worktree.
