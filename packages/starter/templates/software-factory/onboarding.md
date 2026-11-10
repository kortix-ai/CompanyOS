## Software Factory: the steps of this template

Run the guide below as written. This template adds five steps at the points
named here. The factory is one agent, `factory`, with one contract skill,
`software-factory`. Its files are under `.kortix/software-factory/`: read
`skills/software-factory/SKILL.md` once before you start, so you know the
store, the sources and the merge policy you set up.

### A. After guide step 4: analyse the project, write factory.json

1. Run every check of
   `.kortix/software-factory/skills/software-factory/references/analysis.md` on
   the checkout. Read only; never `cat` an env file.
2. **Ask** which ticket store is the source of truth (analysis section 2).
   Recommend the one the team uses; none: GitHub Issues on this repository.
3. **Ask** which sources to turn on. Show only the ones whose evidence you
   found, one line each with what it needs. Default: `github-issues` and
   `tests`. Security: **Ask** for the targets; the default is the app in its own
   sandbox only.
4. **Ask**: "May the factory merge pull requests that pass every gate, or does
   a person merge each one?" Default and recommended to start: a person merges
   (`merge.policy: hold`).
5. Write `.kortix/software-factory/factory.json` (analysis section 6). Turn
   each chosen source's trigger on and every other source's trigger off in
   `factory.yaml` (`enabled: true` or `false`), so the two files agree.

### B. After guide step 5: grant the dev environment

Add `dev-environment` to `agents.factory.skills` in
`.kortix/software-factory/factory.yaml`, once guide step 5 registered it. The
workers verify every change with its commands.

### C. After guide step 9: the store and each source's secrets

1. **The store.** GitHub Issues: create the labels `factory`, `kortix`,
   `factory:triage`, `factory:ready`, `factory:in-progress`,
   `factory:in-review`, `factory:blocked`, `priority:1` … `priority:4`,
   `needs-review`, `do-not-merge` (`gh label create <name> --force`). Linear,
   Jira or Asana: connect it (`kortix connectors add <slug>`, or
   `kortix secrets request <TOKEN>` for the API token), create the `factory`
   label, read the state, status or section ids and write them into
   `store.states` (`references/stores/<kind>.md` names them). JSON file: create
   the branch with `{"version":1,"next_id":1,"tickets":[]}`.
2. **Each enabled source's credential**, by name only, with
   `kortix secrets request <NAME> --scope runtime`: Sentry `SENTRY_AUTH_TOKEN`
   and `SENTRY_ORG`; Better Stack `BETTERSTACK_API_TOKEN`; logs and database a
   read-only `FACTORY_DB_READONLY_URL` (or `SUPABASE_ACCESS_TOKEN` and
   `SUPABASE_PROJECT_REF`, `CLICKHOUSE_URL`); Slack, support inbox: the
   connector. Refuse any production write credential.
3. **The error tracker's webhook** (source-errors only): read the URL with
   `kortix triggers info source-errors --json` and set it in the tracker with
   the header `Authorization: Bearer <FACTORY_ERRORS_WEBHOOK_SECRET>`, as the
   tracker's reference says. Send one test alert and confirm it in
   `kortix triggers runs source-errors`.

### D. Guide step 10 also covers this template

It creates two GitHub webhooks: `issues` → `source-github-issues` and
`pull_request_review`, `pull_request_review_comment`, `issue_comment` →
`factory-feedback-github`. Both use `FACTORY_GITHUB_WEBHOOK_SECRET`.

### E. Instead of guide step 11: prove one ticket end to end

1. **Ask** for one tiny, real change (a typo, a missing test, a small bug) or
   propose one you found in the analysis.
2. File it in the store as a person would: on GitHub Issues,
   `gh issue create --title "<title>" --body "<what, where, expected>" --label kortix`.
   The webhook fires `source-github-issues`; confirm with
   `kortix triggers runs source-github-issues`.
3. `kortix triggers fire factory-intake --wait 300s`. The run line shows
   `dispatched=1`. Give the person the worker session link from the
   `[factory-intake] claimed` comment.
4. Wait for the `[factory-worker] handoff` comment (up to ~30 min). Open the
   pull request with the person: the **Review in 60 seconds** section, the
   commands with their real output, the demo when the change is visible.
5. `kortix triggers fire factory-merge --wait 300s`. Under `hold`, the pull
   request gets `needs-review` and one held comment: the person merges it.

### F. Add to the guide's step 12 report

- The store and its link; the enabled sources with their schedules; the merge
  policy and how to change it (`merge.policy` in factory.json).
- How to hand work to the factory: label a GitHub issue `kortix` (or assign the
  agent user in Linear, Jira or Asana).
- The caps: at most `caps.workers` workers at once, at most 5 new tickets per
  source per day.
- What every loop costs: intake runs every 5 minutes, one short turn when
  there is nothing to do. Change `factory-intake`'s `cron` to run less often.
