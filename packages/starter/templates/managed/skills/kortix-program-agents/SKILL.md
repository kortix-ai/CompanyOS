---
name: kortix-program-agents
description: "Write a program agent: an agent in kortix.yaml with `run: <command>` that runs code for each turn instead of a model. Load when someone asks for an agent, a trigger or an automation that runs a script, a TS/JS/Python file, `@kortix/sdk` code or any fixed sequence of steps with no judgment, or when you edit an agent block that has `run`."
metadata:
  kortix-feature-flag: program_agents
---

<skill name="kortix-program-agents">

<overview>
A program agent is an agent whose turn runs a command instead of a model.
It keeps everything an agent has: its identity and grants, its computer
(`workspace`), its secrets, and every way to start it (triggers, chat,
Spaces, the `agent` tool of another agent).

Choose it for fixed steps: a sync, a report, a cleanup, a webhook handler.
Choose a model agent for judgment: reading, deciding, writing for people.
</overview>

<shape>
```yaml
agents:
  janitor:
    description: Closes pull requests idle for 30 days.
    run: pnpm tsx agents/janitor.ts
    secrets: [GITHUB_TOKEN]
    kortix_permissions: [workspace.gitops.read]
    workspace:
      repos: [{ path: /workspace }]
      setup: [pnpm install --frozen-lockfile]

triggers:
  - slug: janitor-hourly
    on: { every: 1h }
    run: { agent: janitor, prompt: "{{ payload }}" }
```

- `run` is one shell command (1 to 4096 characters). Put the logic in a file in the repository.
- `run` excludes `model`, `prompt` and `prompt_file`: validation fails with them.
- Model keys (`variant`, `temperature`, `codemode`, `skills`, …) have no effect: validation warns.
- `workspace.repos` clones the repository (needs `workspace.gitops.read`); `workspace.setup` installs dependencies. The command waits for both.
</shape>

<contract>
One turn = one run of the command, in the first `workspace.repos` path (else `/workspace`):

| | |
| --- | --- |
| Input | The turn's message on stdin. `$KORTIX_EVENT_PATH` names a JSON file: `{ version, session_id, agent, prompt }`. |
| Trigger payload | Write `prompt: "{{ payload }}"` on the trigger: stdin is then the whole payload as JSON (`trigger`, `fired_at`, `source`, the webhook or event body). |
| Reply | stdout, rendered as Markdown. The first 256 KiB are kept. |
| Failure | A non-zero exit fails the turn; the error shows the last 4 KiB of stderr. A failed run is never retried. |
| Stop | SIGTERM to the command's process group, SIGKILL 5 s later. |
| Environment | The agent shell's: its granted secrets, `KORTIX_TOKEN`, `KORTIX_API_URL`, `KORTIX_PROJECT_ID`, `KORTIX_SESSION_ID`, `KORTIX_AGENT_NAME`. |
</contract>

<sdk>
`createKortix()` with no options uses the computer's `KORTIX_API_URL` and `KORTIX_TOKEN`, so calls act as the agent:

```ts
import { readFileSync } from 'node:fs'
import { createKortix } from '@kortix/sdk'

const event = JSON.parse(readFileSync(process.env.KORTIX_EVENT_PATH!, 'utf8'))
const payload = JSON.parse(event.prompt) // with prompt: "{{ payload }}"
const kortix = createKortix()
const sessions = await kortix.project(process.env.KORTIX_PROJECT_ID!).sessions.list()
console.log(`Checked ${sessions.length} sessions for ${payload.trigger.slug}.`)
```

Add `@kortix/sdk` to the repository's `package.json` and install it in `workspace.setup`.
</sdk>

<checks>
1. `kortix validate`: no error on the agent.
2. Run the command once by hand in a session with a sample input: `echo '<input>' | KORTIX_EVENT_PATH=/tmp/e.json <command>`.
3. Fire the trigger (`kortix triggers fire <slug>`) and read the run's outcome.
</checks>

<off>
The `program_agents` feature must be on for the workspace. With it off, a turn of a program agent fails with "Program agents are off for this workspace" and nothing runs.
</off>

</skill>
