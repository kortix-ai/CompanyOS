# My Kortix benchmark

Tasks in the Harbor format that score My Kortix on what people ask it to do.
Each task folder holds `instruction.md`, `task.toml`, `tests/test.sh` and a
reference `solution/solve.sh`. A grader reads the end state, the agent's last
reply (`/logs/agent/response.md`) and, through `kortix`, the session the agent
ran in (`$KORTIX_SESSION_ID`). Open-ended criteria use `kortix evals judge`.

Run it from any Kortix project with the `evals` flag on:

```yaml
evals:
  my-kortix:
    datasets:
      - git_url: https://github.com/kortix-ai/suna.git
        git_commit_id: dev
        path: evals/my-kortix
    agents: [mykortix]
    n_attempts: 3
```

`schedule-weekly-review` needs the `reminders` flag. Add a task for every
behavior My Kortix must keep, and for every bug fixed in it.
