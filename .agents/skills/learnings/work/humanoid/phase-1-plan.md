# Phase 1 plan: the event log, the dispatcher, humanoid create, email

Status: planned 2026-11-27 against `dev` c161aedbae. Line numbers drift;
search for the named function when a line does not match. The spec is
`README.md`; this file is how phase 1 is built.

## Scope

In: flag `humanoid`; tables `humanoid_identities` and `humanoid_events`;
`recordHumanoidEvent`; adapters for email, Slack, Teams, connector events,
trigger fires and session ends; the dispatcher and the mind; the `humanoid`
starter template; `POST /{ws}/humanoid` (enable and provision, email first);
read routes; `kortix humanoid` CLI; the Humanoid drive.

Out (later phases): phone, authenticator, browser, captcha, reflection,
outcomes, the humanoid home UI, the card.

## Core decisions

1. **Log first, then dispatch, for every source.** For a humanoid project,
   the ingress writes the event and its dispatch job and returns. The
   dispatcher job then delivers. For a channel event, delivery calls that
   channel's existing thread routing (`routeChannelMessage`,
   `createOrJoinThreadSession`, `createOrJoinTeamsConversationSession`), which
   already binds a thread to its owning session and sends follow-ups to it.
   Those functions become the dispatcher's delivery step; they are not
   rewritten. Projects without the flag keep today's path unchanged.
2. **The dispatcher also owns every event no channel routes:** connector
   events, schedules, goal wakes, session ends, events a person posts by API.
   In phase 1 these go to the mind's digest.
2a. **Outbound is logged too.** Replies through the channel turn relay and the
   `kortix_email` send actions record `<source>.message.sent` events, so the
   log holds both sides.
3. **The log is a table, not the job queue.** `job_queue` rows are deleted
   after 7 days (`pruneFinishedJobs`); the log is the episodic memory and is
   kept. The dispatch job rides on `job_queue` (queue `humanoid.dispatch`,
   order key `<project>:<subject>`, seq = the event's `seq`), inserted in the
   same transaction as the event (`enqueueJobs` with `executor`).
4. **The humanoid is My Kortix.** Sessions use `agent_name: mykortix`. The
   flag adds the humanoid context to its prompt; it does not fork the agent.
5. **A failed write is a failed ingress.** For a humanoid project the
   webhook answers 5xx when the event cannot be stored, so the upstream
   retries (Slack, Resend and Composio all retry). This is the write-ahead
   guarantee: an event is never acted on without a row.

## Data model (migration)

`kortix.humanoid_identities` (one row per project):
`project_id` PK/FK, `name`, `role`, `email_connection_id` (FK
`connector_connections`, nullable), `phone_number` (nullable), `browser_id`
(nullable), `drive_id` (nullable), `mind_session_id` (nullable),
`status` (`provisioning | ready | failed`), `last_error`, `created_at`,
`updated_at`.

`kortix.humanoid_events`:
`id` uuid PK, `seq` bigint identity (global, orders arrival), `project_id` FK,
`source` text, `type` text, `subject` text null, `external_id` text,
`occurred_at`, `received_at` default now(), `actor` jsonb null,
`audience` text default `team`, `summary` text, `payload` jsonb,
`routed_session_id` uuid null, `routed_at` null, `dispatch_status`
(`pending | routed | digested | recorded | dead`; `recorded` = an outbound or informational event that needs no delivery).
Unique `(project_id, source, external_id)`. Index `(project_id, seq desc)`,
`(project_id, subject, seq)`.

## Code

| # | Change | Where |
|---|---|---|
| 1 | Flag `humanoid` (experimental, `wip`, default off, `enforcement: 'routes'`), every registration site the registry header lists | `feature-flags/registry.ts` and the 6 sites |
| 2 | Schema + migration (migration skill) | `packages/db/src/schema/kortix.ts`, `packages/db/migrations/` |
| 3 | `recordHumanoidEvent(input, { executor? })`: flag check (memoized 30 s), insert ON CONFLICT DO NOTHING, enqueue dispatch when the source is not a channel | `apps/api/src/humanoid/events.ts` |
| 4 | Adapters: one call each | `channels/email/session.ts` `handleEmailEvent`; `channels/slack/dispatch.ts` `dispatchSlackEvent`; `channels/teams/dispatch.ts` `handleTeamsActivity`; `projects/trigger-events/deliver.ts` `deliverEvents`; `projects/lib/trigger-fire.ts` `fireGitTrigger`; the turn-end hook |
| 5 | Dispatcher: job handler for `humanoid.dispatch`; the mind: `ensureHumanoidMind(projectId)` creates or revives one `mykortix` session (source `system:humanoid`, metadata `humanoid: {role: 'mind'}`, idempotency key `humanoid:mind:<project>`), and digests go in with `enqueueSessionNotice` | `apps/api/src/humanoid/dispatch.ts`, `humanoid/mind.ts` |
| 6 | Starter template `humanoid`: `general-knowledge-worker` plus `humanoid/self.md`, the humanoid skill (identity, the log, how to onboard into a company by invite) | `packages/starter/templates/humanoid/` |
| 7 | Routes: `GET /{ws}/humanoid` (identity + counts), `POST /{ws}/humanoid` (enable flag, create identity row, create the Resend inbox with `agentName: mykortix`, create the Humanoid drive), `GET /{ws}/humanoid/events?before=&subject=&source=`, `POST /{ws}/humanoid/events` (a person or the humanoid posts an event) | `apps/api/src/humanoid/routes.ts` |
| 8 | SDK + CLI: `kortix humanoid show | create | events [--follow]` | `packages/sdk`, `apps/cli/src/commands/humanoid.ts` |
| 9 | Prompt: the humanoid section for My Kortix when the flag is on: its identity, its log (`kortix humanoid events`), the mind/worker roles | `projects/lib/my-kortix-prompt.ts` |

## Tests and proofs

- Unit: the dispatcher's routing decision (pure function).
- DB suite `integration-humanoid-events.test.ts`: dedup on redelivery;
  per-subject order; event + job commit together; a disabled flag records
  nothing.
- REST flow `tests/src/flows/humanoid.flow.ts` EMP-1: flag off → 403; create →
  identity row and inbox; post an event → listed with `dispatch_status`;
  dedup → one row; cleanup.
- Local proof with a real stack: mail to the humanoid address and a Slack
  mention each start a worker and appear in `kortix humanoid events`; a
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
