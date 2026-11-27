# Phase 1 plan: the event log, the dispatcher, employee create, email

Status: planned 2026-11-27 against `dev` c161aedbae. Line numbers drift;
search for the named function when a line does not match. The spec is
`README.md`; this file is how phase 1 is built.

## Scope

In: flag `employee`; tables `employee_identities` and `employee_events`;
`recordEmployeeEvent`; adapters for email, Slack, Teams, connector events,
trigger fires and session ends; the dispatcher and the mind; the `employee`
starter template; `POST /{ws}/employee` (enable and provision, email first);
read routes; `kortix employee` CLI; the Employee drive.

Out (later phases): phone, authenticator, browser, captcha, reflection,
outcomes, the employee home UI, the card.

## Core decisions

1. **Channels keep their own thread routing in phase 1.** Email, Slack,
   Teams, Telegram and Discord already map a thread to its owning session
   (`routeChannelMessage`, `createOrJoinThreadSession`,
   `createOrJoinTeamsConversationSession`). The adapter records the event and
   the session it reached. Moving their routing behind the dispatcher is a
   later refactor; doing it now would touch five channels for no new
   behavior.
2. **The dispatcher owns every event no channel routes:** connector events,
   schedules, goal wakes, session ends, events a person posts by API. In
   phase 1 these go to the mind's digest.
3. **The log is a table, not the job queue.** `job_queue` rows are deleted
   after 7 days (`pruneFinishedJobs`); the log is the episodic memory and is
   kept. The dispatch job rides on `job_queue` (queue `employee.dispatch`,
   order key `<project>:<subject>`, seq = the event's `seq`), inserted in the
   same transaction as the event (`enqueueJobs` with `executor`).
4. **The employee is My Kortix.** Sessions use `agent_name: mykortix`. The
   flag adds the employee context to its prompt; it does not fork the agent.
5. **Recording never blocks or breaks a channel.** An adapter call is
   best-effort: a failure is logged and counted, and the channel goes on.
   Only the dispatcher path (decision 2) depends on the log.

## Data model (migration)

`kortix.employee_identities` (one row per project):
`project_id` PK/FK, `name`, `role`, `email_connection_id` (FK
`connector_connections`, nullable), `phone_number` (nullable), `browser_id`
(nullable), `drive_id` (nullable), `mind_session_id` (nullable),
`status` (`provisioning | ready | failed`), `last_error`, `created_at`,
`updated_at`.

`kortix.employee_events`:
`id` uuid PK, `seq` bigint identity (global, orders arrival), `project_id` FK,
`source` text, `type` text, `subject` text null, `external_id` text,
`occurred_at`, `received_at` default now(), `actor` jsonb null,
`audience` text default `team`, `summary` text, `payload` jsonb,
`routed_session_id` uuid null, `routed_at` null, `dispatch_status`
(`pending | routed | digested | dead | channel`).
Unique `(project_id, source, external_id)`. Index `(project_id, seq desc)`,
`(project_id, subject, seq)`.

## Code

| # | Change | Where |
|---|---|---|
| 1 | Flag `employee` (experimental, `wip`, default off, `enforcement: 'routes'`), every registration site the registry header lists | `feature-flags/registry.ts` and the 6 sites |
| 2 | Schema + migration (migration skill) | `packages/db/src/schema/kortix.ts`, `packages/db/migrations/` |
| 3 | `recordEmployeeEvent(input, { executor? })`: flag check (memoized 30 s), insert ON CONFLICT DO NOTHING, enqueue dispatch when the source is not a channel | `apps/api/src/employee/events.ts` |
| 4 | Adapters: one call each | `channels/email/session.ts` `handleEmailEvent`; `channels/slack/dispatch.ts` `dispatchSlackEvent`; `channels/teams/dispatch.ts` `handleTeamsActivity`; `projects/trigger-events/deliver.ts` `deliverEvents`; `projects/lib/trigger-fire.ts` `fireGitTrigger`; the turn-end hook |
| 5 | Dispatcher: job handler for `employee.dispatch`; the mind: `ensureEmployeeMind(projectId)` creates or revives one `mykortix` session (source `system:employee`, metadata `employee: {role: 'mind'}`, idempotency key `employee:mind:<project>`), and digests go in with `enqueueSessionNotice` | `apps/api/src/employee/dispatch.ts`, `employee/mind.ts` |
| 6 | Starter template `employee`: `general-knowledge-worker` plus `employee/self.md`, the employee skill (identity, the log, how to onboard into a company by invite) | `packages/starter/templates/employee/` |
| 7 | Routes: `GET /{ws}/employee` (identity + counts), `POST /{ws}/employee` (enable flag, create identity row, create the Resend inbox with `agentName: mykortix`, create the Employee drive), `GET /{ws}/employee/events?before=&subject=&source=`, `POST /{ws}/employee/events` (a person or the employee posts an event) | `apps/api/src/employee/routes.ts` |
| 8 | SDK + CLI: `kortix employee show | create | events [--follow]` | `packages/sdk`, `apps/cli/src/commands/employee.ts` |
| 9 | Prompt: the employee section for My Kortix when the flag is on: its identity, its log (`kortix employee events`), the mind/worker roles | `projects/lib/my-kortix-prompt.ts` |

## Tests and proofs

- Unit: the dispatcher's routing decision (pure function).
- DB suite `integration-employee-events.test.ts`: dedup on redelivery;
  per-subject order; event + job commit together; a disabled flag records
  nothing.
- REST flow `tests/src/flows/employee.flow.ts` EMP-1: flag off → 403; create →
  identity row and inbox; post an event → listed with `dispatch_status`;
  dedup → one row; cleanup.
- Local proof with a real stack: mail to the employee address and a Slack
  mention each start a worker and appear in `kortix employee events`; a
  posted connector-style event reaches the mind's digest.
- Dev proof after merge: the same on dev.

## Risks

1. **Volume.** A busy Slack workspace makes thousands of events a day. The
   insert is one row; the summary is made by code; payloads above 64 KB
   store a pointer.
2. **Private events.** A DM's body is in the log. Audience is set by the
   adapter (`private:<sender>` for DMs and one-to-one mail); every read route
   filters by it, and the mind's digest carries only the summary of events
   whose audience is `team` or `public`.
3. **Managed email is behind an operator switch** because Kortix pays for each
   inbox. Dev and prod need `RESEND_MANAGED_EMAIL_ENABLED`; billing for it is
   a phase 2 item.
