---
name: evals
description: "The Kortix eval system (flag `evals`): Harbor-format tasks, suites under `evals:` in kortix.yaml, the trial runner on the worker, scoring, the Evals page, `kortix evals`, and the My Kortix benchmark in evals/my-kortix. Load before you change anything under apps/api/src/projects/evals, routes/evals.ts, worker/jobs/eval-runner.ts, packages/api-contract/src/evals.ts, packages/manifest-schema/src/evals.ts, the SDK evals client or hooks, apps/cli/src/commands/evals.ts, apps/web/src/features/workspace/evals or evals/; before you change My Kortix (run its benchmark before and after); and when an eval job hangs, errors or scores wrong."
---

# Evals

Agents are built against evals: tasks with a verifier that writes a score.
The product side (how a user writes tasks and climbs a score) is the managed
skill `packages/starter/templates/managed/skills/kortix-evals/SKILL.md`. This
file is how the system works and how to verify a change to it.

## The model (Harbor's, unchanged)

| Harbor | Kortix |
| --- | --- |
| task folder (`instruction.md`, `task.toml`, `environment/`, `tests/test.sh`, `solution/solve.sh`) | read as is from the project repo, a public git repo (`git_url`), or the Harbor registry (`name`, `version`) — `projects/evals/task-source.ts`, `harbor-task.ts` |
| job config (`n_attempts`, `agents`, `datasets`, …) | a suite under `evals:` or a `config:` file — `packages/manifest-schema/src/evals.ts` → `projects/evals/config.ts` |
| trial | one session (`source: system:eval`) and its sandbox — `projects/evals/runner.ts` |
| environment `docker_image` / repo Dockerfile | a project sandbox template `eval-<hash>` made on first use, reused after |
| reward file, error policy, mean / pass@k | `projects/evals/scoring.ts` (Harbor's `error_policy.py` groups) |
| `jobs/<job>/<trial>/result.json` | Files `/Evals/<job>/<trial>/…`, written once by the API (`storage.ts`) |

`eval_jobs` / `eval_trials` are the index and the queue state; the job folder
in Files is the content.

## Trial lifecycle (runner.ts, one leader tick every 3 s busy / 15 s idle)

`queued → starting` (session created; id stored first, so a lost create is
found, not repeated) `→ agent_running` (the turn ledger `session_turns` says
when the agent stopped; `oracle` runs `solution/solve.sh` detached instead)
`→ verifying` (`/tests` uploaded only now, `/logs/agent/response.md` = the
agent's last reply, verifier env gets `KORTIX_SESSION_ID`,
`KORTIX_EVAL_JOB_ID`, `KORTIX_EVAL_TRIAL_ID`, `KORTIX_FEATURE_FLAGS`)
`→ completed | errored | cancelled`. Every step is short and repeatable.

Sandbox commands go through the PROVIDER exec (`box.ts`), as root, never the
in-box daemon. Two rules learned on 2026-11-13:
- A detached command must reach its own session before the exec returns:
  `launch` waits until the wrapper wrote its pid. A plain `nohup … &` child
  died with the exec call.
- One copy of a script per command: Linux caps one argument at 128 KiB.
  Upload chunks are 48 KiB.

Each tick also stops the sandbox of any ended trial that still runs (a
cancel that landed during session create).

## Verify a change locally

1. `pnpm worktree start evals --no-web` (or your worktree). A worktree stack
   runs no singleton workers, so start the runner tick yourself in a loop
   with the API process's environment: import `src/app`, call
   `prepareProcess({ entry: true })` (it loads the model lineup; without it
   every trial fails `No model`), then `runEvalRunnerTick()` every few
   seconds.
2. Mint a user (CLAUDE.md "Authenticating"), turn on the flag:
   `PATCH /workspaces/:id/features {"feature":"evals","enabled":true}`.
3. Commit tasks + an `evals:` suite, then drive it with the real CLI
   (`KORTIX_API_URL`, `KORTIX_TOKEN`, `KORTIX_PROJECT_ID`, `KORTIX_FEATURE_FLAGS=evals`):
   `kortix evals run smoke --wait`, `show`, `compare`, `trial … --file verifier/test-stdout.txt`.
4. A change is proved when `oracle` scores 1 and `nop` 0 on every task,
   and a model agent's trial shows real token usage.
5. REST contract: `pnpm test -- --id EVAL-1` (no sandbox; planning,
   validation, cancel, rerun, delete).

## The My Kortix benchmark

`evals/my-kortix/` holds tasks for what people ask My Kortix to do. Run it
before and after any change to My Kortix (its prompt
`apps/api/src/projects/lib/my-kortix-prompt.ts`, its skills, its model) and
put both scores in the PR:

It is a built-in dataset: every project can name it, and it is read from the
Kortix repository at the commit the API was built from (`version` pins
another commit, branch or tag, e.g. your branch while you change the tasks):

```yaml
evals:
  my-kortix:
    datasets:
      - name: kortix/my-kortix
        version: <your branch>   # optional
    agents: [mykortix]
    n_attempts: 3
```

Built-in datasets are listed in `BUILTIN_DATASETS`
(`apps/api/src/projects/evals/task-source.ts`); add one there for every
folder of tasks Kortix ships.

A task that needs a flag says so in `task.toml` `[metadata] requires_flags`.
Judged criteria call `kortix evals judge`, so they need a sandbox image whose
CLI has it.

## Not supported yet

Multi-step tasks, docker-compose environments, a separate verifier
environment, Windows, GPUs, `metric.py`, Harbor's Python agents
(`import_path`). Each is refused with a reason (`TaskUnsupportedError`, a
validation issue), never run wrong.
