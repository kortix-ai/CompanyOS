# The event ledger, the board and the cognitive loop

Status: design (2026-11-27), after the action space is finished. Owner: the
`digital-employee` branch. Decisions in `decisions.md`.

## Intent (Marko, 2026-11-27)

The Humanoid is My Kortix at full strength: it fills any role the way a
forward deployed engineer would, by building software, agents, triggers,
unified data and connections, over long horizons. A person reaches it through
any channel (email, Slack, Teams, SMS, Discord, WhatsApp); everything it
should know about arrives as an event in one infinite write-ahead log, its
notification centre. Each event is dispatched to a new session or routed to
the session already linked to it. One Humanoid on the outside, swarms of
agents underneath. Global review triggers read sessions, events, knowledge
and data, and give it new tasks on their own.

## Layers (ACE, mapped to Kortix)

| ACE layer | Kortix piece |
|---|---|
| Aspirational | The workspace charter: `kortix.yaml`, AGENTS.md, values the Humanoid keeps |
| Global strategy | Goals (`goals`, flag `goals`), long-horizon plans |
| Agent model | Identity (the connector accounts it owns), capabilities, skills |
| Executive function | The dispatcher over the ledger: priority, routing, budget in credits |
| Cognitive control | Review triggers: session review, sleep, self-written evals (`../continual-learning/`) |
| Task prosecution | Sessions and subagents with the connector action space |

## 1. One ledger per workspace

Every emitter writes here first, then the dispatcher acts. On this branch the
table exists as `humanoid_events` (log-first, dispatch on the job queue,
states `pending → routed | digested | recorded | dead`). It becomes the
workspace's ledger, not a Humanoid-only table.

Emitters, all written to the same ledger:

- people: channel messages (email, Slack, Teams, Telegram; SMS through the
  phone number; Discord and WhatsApp later);
- schedules: cron triggers and an agent's own wake-ups;
- webhooks;
- app events (`projects/trigger-events/`: push, or poll with `poll-store.ts`);
- monitors: a new emitter kind. A schedule runs a connector action (an API
  read, a log query, a page check) and emits an event only on a change;
- sessions: finished, failed, waiting on a person;
- the system: a deploy, a credit low, a connector that lost its sign-in.

Every event carries `source`, `kind`, a body, and **links**: the business
objects it is about (`thread:<channel>/<id>`, `ticket:<id>`, `customer:<id>`,
`pr:<repo>#<n>`). Links make routing and aggregation work.

## 2. Routing

1. A session already linked to one of the event's links gets it delivered
   (steer or queue). One Slack thread is one session.
2. Otherwise a procedure decides (section 4): start a session, a task on the
   board, or nothing.
3. Otherwise it is digested: recorded into memory, no session.

Sessions are meta-aware: a session reads the ledger for its own links and
sees the related events.

## 3. The board (the Vercel Board method on our ledger)

The work layer above the ledger, for one Humanoid with swarms underneath:

- topics (channels) group threads; a task is a thread with a state;
- an agent claims a task with a lease, renews it, completes it; a task can
  depend on another;
- people join any thread; Slack and other channels mirror threads both ways;
- watchers: a post or a label change is itself an event in the ledger.

Kortix already has pieces: the harness's team task tools (`task_create`,
`task_list`, `task_get`, `task_update`), session groups (spaces), session
messaging. The board unifies them; it is not a second product.

## 4. One place to configure events

A workspace page (and a `kortix.yaml` section) with two halves:

- **sources:** every emitter above, with its schedule, filter and links;
- **procedures:** when events match, what happens: route to an agent, run a
  skill or a workflow, create a board task, ask a person, or only record.

Triggers today are a source and a procedure in one entry; they map onto
this without a break.

## 5. The forward-deployed-engineer default

The Humanoid's default harness approaches any role by building: Apps,
agents, triggers, monitors, connectors, unified data. Global review triggers
(daily and on idle) read the ledger, sessions and knowledge and create its
next tasks: what to update, whom to ask, what to automate.

## Process mining, for comparison

Process-mining products (Celonis is the known one) build an object-centric
event log from a company's systems, reconstruct how work really flows, and
trigger actions on it. The ledger with links is the same kind of log; the
difference is that here agents act on each event as it arrives, and build the
missing pieces themselves.

## Order

1. The action space (connectors): in progress.
2. The workspace ledger and routing by links.
3. Monitors as an emitter.
4. The events page: sources and procedures.
5. The board: tasks, claims, leases, dependencies.
6. Review triggers and the FDE default.
