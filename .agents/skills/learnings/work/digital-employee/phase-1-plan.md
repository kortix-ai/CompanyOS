# Phase 1 plan: one self, one memory, the mind (flag `digital_employee`)

Status: planned 2026-11-26 against `dev` 79ef4546ed. Not built. Line numbers
drift; search for the named function when a line does not match.

## Core decision

The employee is the existing built-in agent `mykortix`. With the flag on, the
per-person parts become per-project: the prompt, the memory layer, the
per-turn `system` text and channel routing. With the flag off, every path is
byte-identical. This keeps My Kortix's grant, sandbox slug, release variant,
`kortix_memory` tool and the existing `isMyKortixSession` checks.

## 1. Reuse and gaps

Reuse:

| Need | Existing piece |
|---|---|
| Per-turn system text | the turn `system` field, 16k cap (`apps/kortix-sandbox-agent-server/src/harness/README.md`), set by hidden `kortix-turn` (`pi/runtime.ts`); the API builds it in `addMemoryTurnLayers` (`apps/api/src/sandbox-proxy/forward/turn-start.ts`). Channel prompts pass through it too |
| Prompt delivery | `buildMyKortixConfig()` (`apps/api/src/projects/lib/my-kortix-agent.ts`), called at boot (`projects/lib/session-sandbox-env-build.ts`) and per release (`config-releases/builder.ts`); the mykortix release id is the governance etag, so a new prompt is a new release and boxes converge |
| Commit a file | `commitRepoFile` (`projects/lib/trigger-manifest.ts`) under `PROJECT_AGENT_WRITE` |
| One page per fact | `saveMyMemory` with CAS `ifMatch` (`memory/my-memory.ts`) |
| Memory API and tool | `projects/routes/project-my-memory.ts`, the `kortix_memory` tool, caller gate in `projects/routes/project-memory.ts` |
| Thread ownership | `chat_threads` + `bind_chat_thread` postCreate (`channels/core/conversation.ts`); follow-ups go to the owner |
| Email and Slack routing | `handleEmailEvent` → `routeChannelMessage` (`channels/email/session.ts`); `createOrJoinThreadSession` (`channels/slack/session.ts`) |
| Coalesced feed | `enqueueSessionNotice` (`projects/session-notice-batch.ts`, 1.5 s hold) |
| Child → parent report | `noticeParentOf` (`projects/subagent-notice.ts`) |
| Live board template | `chatThreadBoardTurn` (`projects/lib/chat-threads.ts`) with `visibleToEveryViewer` |
| The mind starts workers | the `agent` tool (background, `name`), `send_message`, `task_stop` |
| Events into a session | session-target runtime triggers (`projects/routes/runtime-triggers.ts`), `integrations/event-inbox.ts` |
| Protected Drive folders | the folder ACL in `drives/folders.ts` |
| Job template | `worker/jobs/goal-reconciler.ts` |

Gaps: the self file and its routes, an employee memory layer with audience
and source, a participant model for every channel plus the audience filter,
the mind (ensure, router, feed, worker notices), the "now" board, the
consolidation job, the flag.

Found on the way: `withMemoryCaller` requires `on_behalf_of`, and email
sessions never set it (`projects/lib/on-behalf-of.ts`), so `kortix_memory` is
refused in every email session today. The employee path keys a conversation by
`session_id`, not by person.

## 2. Data model

**The self (git).** `employee/self.md`: front matter `{name, role, manager
(member user id), timezone}`, body `## Values`, `## Rules`. Schema
`EmployeeSelfSchema` in `packages/api-contract`, parsed with
`memory/front-matter.ts`. Read at both config compile sites with
`readRepoFile` and passed into `buildMyKortixConfig({ self })`, which stays
pure. The prompt becomes `employeePrompt(self)` in a pure
`employee-prompt.ts`: an identity section and a "One self" section, then the
My Kortix sections with IDENTITY and MEMORY swapped. No self yet: the prompt
says "interview your manager".

**The memory layer (Drive).** `/Employee/Memory` with `facts/<name>.md`
(canonical) and `notes/<date>/<session>-<ulid>.md` (append-only). Layer key
`employee` in `memory/employee-memory.ts`. With the flag on, the My Kortix
memory routes and `addMemoryTurnLayers` branch to it; the per-viewer
`/Users/<viewer>/Memory/mykortix` layer is never read for that project. The
folder is protected in `drives/folders.ts` with the flag on: people only,
never through a session, not grantable, never mounted. The memory API is the
only reader.

**A fact.** Front matter `name`, `description`, `type`, `audience` (`public |
team | private:<personKey>`), `source {session_id, channel, speaker, at}`,
`updated_by`. `personKey` is a member user id, `email:<mailbox>`, or
`slack:<team>:<uid>` for an unlinked person.

**Consolidation.** A save appends a note, so parallel writes never conflict.
Recall reads facts plus pending notes, newest per name wins, so a fact is
visible to every copy at once. Job `worker/jobs/employee-memory.ts` (tick
~60 s, `runWorkerTick`) folds notes into `facts/` and deletes them.
Deterministic, no model call in phase 1.

**Per-session state.** A server-managed metadata key `employee` (added to
`SERVER_MANAGED_SESSION_METADATA_KEYS`):
`{ role: 'mind'|'worker', mind, conversation: { kind: 'dm'|'group'|'email'|'web'|'self', people, members, speaker } }`,
updated with an atomic `jsonb` union on every inbound message.

## 3. Routing

- **The mind.** One per project, created lazily by
  `ensureEmployeeMind(projectId)` under claim key `employee:mind:<projectId>`.
  Runs as the automation actor, visibility `private`. "Always on" = always
  addressable: delivery wakes a parked box; a mind that was deleted or failed
  is recreated on the next event.
- **Channel events** (Slack and email routers, behind the flag): build the
  conversation, force `agent_name: mykortix`. Known thread → the owning
  worker, plus a short `follow_up` notice to the mind. New thread → create
  the worker with `employee:{role:'worker', mind}` and `bind_chat_thread`,
  then `enqueueSessionNotice(mind, …)`. The notice text is redacted by the
  discretion rule: a private conversation's body never reaches the mind.
- **Other events** (runtime triggers, connector events, goal wakes) go to the
  mind, which starts workers with the `agent` tool.
- **Workers report.** `noticeParentOf` treats `employee.mind` as the parent
  of a worker.
- **Not `spawned_by_session`.** A child via `callerSessionId` would swap
  Slack's `on_behalf_of`, inherit channel-write scope and get the 2-minute
  child idle rule. The metadata key avoids all three.
- **The "now" board.** `employeeNowTurn(projectId, sessionId)` lists the
  mind's live workers. A line whose audience does not cover the current
  conversation shows only "busy in another conversation · working · since
  14:02". Added in the employee branch of `turn-start.ts`, 10 s memo.

## 4. The discretion check

Participants, written by the routers into `employee.conversation`:

| Conversation | kind | people | ceiling |
|---|---|---|---|
| Slack DM | `dm` | the linked sender | `private:<sender>` |
| Slack channel thread | `group` | every sender seen | `team` |
| Email | `email` | From, To, Cc minus the employee's inbox, mapped to members, else `email:<addr>` | by people |
| Web or voice | `web` | creator plus session-grant members | by people |
| Mind, or a worker with no human | `self` | none | `team` |

The rule, one pure function `audienceCovers(audience, conv)` in
`memory/employee-audience.ts`: `public` always; `team` when every participant
is an account member and none is external; `private:X` when people = [X] and
the kind is not `group`.

Applied at: the turn index, `list` and `view` (a hidden fact is a 404, like a
missing one), person search, the "now" board. Raw Drive reads are blocked by
the folder protection.

Write defaults: `private:<speaker>`; in a members-only `group`, `team`. An
explicit audience must be `public`, `team` or `private:<a participant>`. The
server stamps `source`.

## 5. The flag

`digital_employee`: experimental, `wip`, default off, `enforcement: 'routes'`
with an `enforcementNote` listing the gates. Register it in every place the
header of `apps/api/src/feature-flags/registry.ts` lists. It needs
`builtin_agents.my_kortix: true`; without it the router logs and keeps
today's behavior.

## 6. Steps

| # | Change | Covering test | Real-surface check |
|---|---|---|---|
| 1 | Register the flag | the feature-flag drift and registry unit tests, contract schemas test, SDK projects test, each by name | `PATCH` the feature on; `KORTIX_FEATURE_FLAGS` in a new box |
| 2 | Self schema, `GET/PUT /workspaces/:id/employee/self` (commits the file), `employeePrompt`, both compile sites | REST flow `tests/src/flows/employee.flow.ts` EMP-1: flag off 403, PUT + GET read-back, commit in the bare repo, bad self 400, no agent-write 403; a builder test that the release id changes with the self | "who are you?" answers with the self's name; edit the self, the box converges |
| 3 | `kortix employee self show\|set` | CLI black-box test | run the CLI in a box |
| 4 | Conversation model and router hooks | DB suite `integration-employee-routing.test.ts` | Slack DM and email locally; read the session metadata |
| 5 | Employee memory layer, audience rule, folder protection, route and turn branches, `audience` on `kortix_memory` | unit `employee-audience.test.ts`; `folders.test.ts` cases; DB suite `integration-employee-memory.test.ts` with `FakeVolume`: a private fact from Sam is not in Alex's index and Alex's view is 404, a team fact shows for both, a session-token Drive read is 404, flag off keeps the per-person layer; kortixd test for the param | Slack DM and email write and recall locally |
| 6 | The mind: ensure, notices with redaction, `noticeParentOf` | DB suite `integration-employee-mind.test.ts` | two threads at once → two workers in parallel; the mind's transcript holds 2 notices and no private body |
| 7 | The "now" board; employee session tokens cannot read sibling logs | extend the memory DB suite | ask one copy "what else are you doing" → no leak |
| 8 | Consolidation job | DB suite with a fake clock; worker scope wiring test | notes fold within ~60 s |
| 9 | Proof runbook; a `deployed` EMP flow step | — | proofs (a)–(d) locally, then on dev |

## 7. Risks and open questions

1. **Code-first routing, not mind-first** (recommended). A Slack answer is
   posted by the thread's bound session, so a mind answering many threads
   breaks the relay. Code-first keeps private text out of the mind and adds
   no latency. Mind-first short answers can come later.
2. **The `audience` param ships in the daemon**, so a kortixd release is on
   the critical path of step 5. Fallback: `kortix employee remember
   --audience`, since the CLI converges at session start.
3. **Leak paths:** Drive reads (step 5), sibling session logs (step 7), mind
   relays (redacted feed), email `project` visibility in the web app (hidden
   in phase 2).
4. **Membership is not always knowable.** A Slack `is_ext_shared` channel
   counts as external. If Resend thread email does not expose Cc, treat the
   thread as possibly external.
5. **Strict schemas.** `MyKortixMemoryEntrySchema` is `.strict()`: add
   `audience` and `source` as optional, sent only for employee projects.
6. **One principal for every copy is phase 3.** Slack sessions still run as
   the sender in phase 1 (`ensureAgentServiceAccount` is the likely path).
7. **Page cap.** The My Kortix index caps at 200 pages; the employee needs
   ~2,000 with a truncated index and, later, a `search` action.
