---
title: Per-agent config releases (each session's box holds only what its agent uses)
status: phase 1 built on branch `per-agent-release` (file lists, `repo-agent` variant, D3); D1–D3 decided 2026-11-23
owner: Dimitrije (decisions)
updated: 2026-11-23
---

# Per-agent config releases

## Problem

A session's box reads its agent config from a config release under
`/opt/kortix/config/<release_id>/`. Today every session with repository access
gets the `project` variant: the whole tree of the base commit, plus the
governance of every agent of the project (`release-tree.ts`, since #9197).

Measured on the largest internal project (42 enabled agents), 2026-11-23:

| Release content | Files | Raw MB | gzip MB |
|---|---|---|---|
| `project` variant today: the whole tree | 2,324 | 25.5 | ~9.4 |
| The files the compiled config names, all 42 agents | 753 | 7.6 | ~3.0 |
| The files one agent uses | 2–228 (median ~104) | 0.03–3.5 | – |

- Governance: 536 KB for all agents, 7–366 KB for one agent.
- Boot cost grows with the file count: the box checks the blob ID of every
  file (`verifyRelease`). On 2026-10-30 this project needed 812 ms from
  `llm-proxy` to `config-release-archive`; a 179-file project needed 364 ms.
  The project had 1,303 files then. Not measured since.
- Churn: the base branch took 481 first-parent commits in 7 days. Each one is
  a new release, and every running session converges onto it in the
  background (`config-convergence-triggers.ts`). With per-agent file lists, an
  agent's release changes on 138–274 of them.

Method: a local script ran the API compiler (`compileAgentConfig`,
`compileSelectedAgentConfig`) on a checkout, then the same closure rules as
`toolsRelease`. It is not committed.

## Goal

One config release per (base commit, agent). It holds only the files that
agent uses in its whole lifecycle, and the governance of that agent and the
subagents it may start. A used file is never left out. When the API cannot be
sure, the session gets the full `project` release, never a broken one.

## Decisions

See `decisions.md`. Summary:

- **D1** An agent switch inside a session converges the box to the new
  agent's release before that turn runs.
- **D2** Every base-branch move publishes the release of every enabled agent.
- **D3** Sessions without repository access get the same file list, including
  the root `AGENTS.md` and the agent's local `./` pi packages.

## What exists today

| Fact | Where |
|---|---|
| `agent:<name>` variant: governance of one agent (+ its subagents), its tool modules and their relative imports, its granted skill folders | `apps/api/src/config-releases/builder.ts` `toolsRelease`, `release-tree.ts` `toolModuleFiles` / `skillFolderFiles` |
| Only sessions with `repository_access: false` get it; it is built on request, never published | `session-agent.ts` `releaseVariantFor`, `publish.ts` (builds `project` only) |
| It omits the root `AGENTS.md` and local `./` pi packages, both of which pi reads from the release | `harness/pi/config.ts` (`AGENTS.md`), `harness/pi/config-release.ts` `localPackageDirs` |
| Four call sites choose "all agents vs one agent" by their own rule | `session-sandbox-env-build.ts:183`, `sandbox-session-push.ts:166`, `session-reload.ts:658`, `session-agent.ts` `releaseVariantFor` |
| Heads table is keyed `(project_id, ref)` | `packages/db/src/schema/kortix.ts` `configReleaseHeads` |
| Secrets are per agent and never in the release | `session-sandbox-env-build.ts` (agent `secrets` allowlist) |
| npm pi packages are per agent (the session agent) and never in the release | `KORTIX_PI_PACKAGES`, `apps/api/src/pi-packages` |
| A prompt may name another agent (`overrides.agent`). The token grant is re-minted for it. `project_sessions.agent_name` keeps the create-time agent | `session-prompts.ts:161`, `pre-prompt-env-sync.ts:325`, `session-token-grant.ts:422` |
| pi runs the prompt's agent only when the compiled set holds it; otherwise it logs and runs the session agent | `harness/pi/runtime.ts` `resolveTurnAgent` |
| Convergence runs after a turn, keyed on `project_sessions.agent_name` | `turn-start-convergence.ts`, `config-convergence-triggers.ts` |
| The composer's agent picker reads the API roster, not the box | `packages/sdk/src/react/use-runtime-sessions/agents.ts` |

What is not in any release and stays out of scope: secrets, npm pi packages,
Kortix managed skills (image), separate-session subagents and workflow
children (their own box and release), and files the model reads in
`/workspace`. A repository-access session keeps the whole checkout in
`/workspace`.

## Why this does not repeat #9197

Before #9197 the release moved folders into an OpenCode layout and left files
out. This design never moves a path: each file sits where the repository put
it. A relative path between two files of the release resolves as it does in
`/workspace`. The one risk left is a file the release leaves out that
something under the release path still reads.

## Design

### 1. The file list of one agent

`agentReleaseFiles` in `release-tree.ts`, called by `agentRelease` in
`builder.ts`. Inputs: the governance `compileSelectedAgentConfig` builds for
the agent. It holds the agent and the subagents it may start (transitively),
and the commands and extensions they enable. Built-in agents are in the set
but disabled. Every rule reads "any enabled agent of the set".

Two scopes:

- `exact`: `agent:<name>`, a session WITHOUT repository access. Only the
  files named, nothing beside them: a file the agent may not use is never
  disclosed.
- `folders`: `repo-agent:<name>`, a session WITH repository access. It holds
  the whole checkout in `/workspace` anyway, so the list takes whole folders
  to never drop a file a tool reads at run time.

| What pi or the agent reads | `exact` | `folders` |
|---|---|---|
| Agent and command prompts | Inlined in governance. No file. | Same |
| Root `AGENTS.md` and `CLAUDE.md` | Each one present | Same |
| Root manifest (`kortix.yaml`): the box reads `sandbox.on_boot` from the release root (`lib/config/config.ts`) | No (no checkout to start) | Yes |
| A skill an agent of the set may load | The whole skill folder | Same |
| Relative links in a skill's `.md`/`.mdx`/`.txt` files (`](x)`, quoted `./x`, `../x`) | Each target that exists: the file, or every file under the folder. Never the repository root. | Same |
| A project tool an agent of the set may call | The module and its relative imports, transitively | Plus every file under the folder of each of those files (never the root), the imports of the code in those folders, to a fixed point |
| `package.json`, `tsconfig.json`, `jsconfig.json`, `bunfig.toml`, lockfiles, `.npmrc` in each folder from a tool file up to the root | No | Yes |
| A local pi package an agent of the set enables | The package folder (a file package is its folder, except at the root) | Same |
| `.gitattributes` `export-ignore` | Removes the path | Same |
| `include:` globs in kortix.yaml | Not built (phase 5) | Same |

Imports and skill links are parsed once per blob per API process
(`git cat-file --batch`, memo by blob ID).

`include:` is new manifest schema. Proposal: a top-level `release.include`
(project-wide globs) and `agents.<name>.include` (that agent only). The exact
key needs a schema review with the `kortix-yaml-versionless` owners.

### 2. Release identity

Unchanged formula: `sha256(config_tree_id + ":" + governance_etag)`. The tree
is the composed tree of the file list (`readFileTree`). Two agents with the
same files and governance share a release. The archive store is keyed by tree
ID, so a commit that does not change an agent's files reuses its archive.

### 3. Variants

- A session without repository access keeps `agent:<name>` (`exact`).
- A session with repository access gets `repo-agent:<name>` (`folders`) once
  the flag is `on`. Phase 1 builds it; nothing assigns it yet. Its archive
  URL carries `&agent=<name>&scope=repo`, and the archive route rebuilds it
  from those (`archiveQueryVariant`).
- `mykortix` and `none` stay as they are. `none` receives no file.
- `project` stays as the full release: the fallback of section 7, and the
  release a session gets while the rollout flag is off.
- One helper decides the governance and the variant for a session. The four
  call sites in "What exists today" call it. Built in the phase that assigns
  `repo-agent` (phase 5), where it changes behavior.

### 4. Publish (D2)

- `config_release_heads` gains `agent_name`. Key: `(project_id, ref,
  agent_name)`. Migration: add the column with default `''` for the existing
  `project` rows, then swap the primary key. Load the **migration** skill.
- `publishConfigRelease` builds every enabled agent of the roster at the tip,
  then upserts one row per agent. A row whose release ID did not change keeps
  its descriptor.
- `configReleaseEnvForSession` reads the row of the session's agent.
- Cost per commit: one governance compile and one file-list walk per agent.
  Archives are content-addressed, so only changed lists build an archive.

### 5. Agent switch (D1)

- **The current agent.** A session needs a record of the agent its box runs.
  `project_sessions.agent_name` stays the create-time agent. Candidate: the
  token grant's `agent` field, which the re-mint already writes on each
  switch (`session-token-grant.ts`). Alternative: a session metadata key.
  Decide in phase 3.
- **Before the switching turn.** In `turn-start.ts`, after the re-mint: when
  the requested agent differs from the current agent, resolve the desired
  release for the requested agent and run `reloadSessionConfig` awaited, with
  a budget. On success, forward the prompt. On timeout or failure, refuse the
  prompt with a stated reason. Never run the turn on the old agent.
- **After a turn and on a base move.** `convergeConfigIfBehind`, the
  descriptor route, `GET /config` and the base-move fan-out key on the current
  agent, not `project_sessions.agent_name`.
- **On the box.** `resolveTurnAgent` keeps its fallback for an old API. With
  this change the API never sends a prompt whose agent the box lacks.
- **Cost.** pi applies a release in place; it restarts in place only when
  project tools or pi packages change. The existing daemon budget is up to
  ~90 s (the proven-check budget, `session-reload.ts`). The real switch cost
  on pi is not measured: phase 3 measures it.
- **Today's mismatch.** A switch to an agent the compiled set lacks already
  runs the session agent under the new agent's grant. Phase 3 removes it.

### 6. Shadow mode: prove no file is missing before any box loses one

The box still runs the full `project` release. It reports which release
files were READ, and the API compares them with the agent's file list. The
box needs no list, and a later rule change is checked against the stored
reads without new box data.

- Access log: after each `verifyRelease` (which reads every file), the box
  resets each file's atime to its mtime. Under `relatime` the first later
  read sets atime again. At turn end and at session stop, the box lists the
  release files whose atime is above the reset time.
- Verified on a dev Platinum box (2026-11-23): `/` is `ext4 rw,relatime`,
  `/opt/kortix/config` is on it, the daemon runs as `kortix` and owns the
  sealed files (mode 0444). After `touch -a -d @<mtime>`, one `cat` moved
  atime from `1795456343` to `1795456384`. `/workspace` is `noatime`; it is
  not used.
- Limit: a `stat` or `existsSync` without a read is not logged.
- The box reports `(release ID, read paths)` to the API. The API stores the
  reads per `(project, commit, agent)`, computes the misses against the
  agent's `folders` list, and logs `[config-releases] closure miss`.
- Run shadow mode on dev, then on internal prod projects, for at least 7 days
  of normal use. The flip needs 0 misses, or an `include:` that covers each.

### 7. Runtime fallback after the flip

A trimmed release can still miss a file that a later commit starts to use.

- The box reports a miss the same way (ENOENT or "Cannot find module" under
  the release path).
- The API records the miss in `config_release_failures` with a reason. The
  desired release of that (commit, agent) becomes the `project` release, with
  `fallback_reason` naming the path. The next commit tries the trimmed
  release again.
- Quarantine needs 2 distinct sessions (`PROJECT_QUARANTINE_SESSIONS`). A
  closure miss needs 1: it is a fact of the file list, not a flaky load.

### 8. `kortix validate`

- Print each agent's file count and size.
- Load each tool module from a temp folder that holds only its agent's file
  list. A load error names the missing path and suggests `include:`.

### 9. Rollout

A per-project flag `agent_releases` with three values: `off` (today),
`shadow`, `on`. Default `off`. Graduate as `config_releases` graduated
(`config-releases/ROLLOUT.md`): flag removed, value inert.

## Measured with the phase 1 rules

The internal project of the Problem section, commit `e9b33abb`, 42 enabled
agents, the `agentReleaseFiles` code run on a local clone as the mirror:

| Scope | Files per agent (min / median / max) | Build, all 42 agents |
|---|---|---|
| `exact` | 1 / 172 / 762 | 0.58 s |
| `folders` | 2 / 187 / 777 | 0.57 s |

- `folders`: 2.91 MB median, 7.7 MB max per agent. All agents together use
  777 of 2,324 files.
- The medians are above the first estimate (~104) because subagent tools,
  skill links and `AGENTS.md` now count. Agents that start many subagents
  approach the union.
- The first version read one blob per `git` process: 27.5 s for the `exact`
  lists. `git cat-file --batch` and the blob memo took it to 0.58 s.

## Phases

Each phase lands on `dev` behind the flag and is verified on the local stack
with real Platinum boxes, then on dev.

1. **API file list. Built.** `agentReleaseFiles` with both scopes, the
   `repo-agent` variant and its archive URL, D3 for no-repo sessions
   (`AGENTS.md`, local pi packages). Tests: `builder.test.ts` (real Git
   repositories) and the CFG-2 flow step for D3.
2. **Box shadow log.** atime reset after verify, read report at turn end
   and stop, the API route and table, miss computation. Turn `shadow` on for
   internal projects on dev, then on prod.
3. **Agent switch.** Current-agent record, the awaited converge before a
   switching turn, convergence keyed on the current agent. Measure the
   switch cost on pi.
4. **Publish per agent.** Heads migration, publish loop, session-create read.
5. **Flip.** `on` for internal projects after 7 days of 0 misses. Runtime
   fallback, `include:` schema, `kortix validate`.
6. **Graduate.** Flag removed. Update `config-releases/ROLLOUT.md` (it is
   already stale: it names the checkout as a release source and a converge
   before the prompt), the developer docs, and the kortix.yaml reference for
   `include:`.

## Risks and open questions

- atime works on Platinum boxes today (verified). A future image that mounts
  `/` with `noatime` disables the shadow log silently: the box must report
  the mount option with its reads.
- The real cost of the converge before a switching turn on pi.
- Retention: a box that switches agents holds more releases. The
  2026-11-21 ledger entry keeps every sealed release for the sandbox
  lifetime. Measure disk use for a session that switches often.
- `KORTIX_PI_PACKAGES` follows the session's create-time agent today, not the
  prompt's. Check whether a switch must also swap the npm packages.
- Publish time for a project with many agents: 42 compiles per commit.
  Measure on the internal project before phase 4 lands.
- Customer projects whose tools read files by computed paths. Shadow mode on
  internal projects does not prove those. The runtime fallback is the net.

## How to pick this up

1. Read this file and `decisions.md`.
2. Read `apps/api/src/config-releases/ROLLOUT.md`, `builder.ts`,
   `release-tree.ts`, `desired.ts`, `publish.ts`, and on the box
   `services/config-provider/obtain.ts`, `harness/pi/config-release.ts`.
3. Search the learnings ledger for `config release` and read every match.
4. Work on branch `per-agent-release` (worktree `suna-per-agent-release`,
   own database).
