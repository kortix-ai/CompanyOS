---
title: Digital employee (My Kortix as a product): one workspace, one self, one memory, the full action space of a person
status: designing (branch `digital-employee`); flag `digital_employee` planned; product name open (decisions.md D1)
owner: Marko (decisions)
updated: 2026-11-26
---

# Digital employee

**The problem.** My Kortix is a strong agent, but it is not an employee. You
open an app to talk to it, every person gets a separate memory, and it acts
only when someone writes to it. A company wants to hire a colleague: one name,
one memory, its own accounts, on every channel the team uses, working on goals
around the clock, many things at once.

**The product.** A black box AI employee at the front. Underneath it is one
Kortix workspace. 1 employee = 1 workspace. You hire it, it interviews you, it
gets its accounts like a new hire, and from then on you talk to it only where
you already work: Slack, Teams, email, SMS, phone, Google Meet, a Slack huddle.
The app only hires and oversees.

## Principles

1. **Black box at the front, a workspace underneath.** Sessions, agents,
   files and `kortix.yaml` stay hidden. "Open workspace" stays for power users.
2. **Conversation only through human channels.** The app has no message box.
3. **General primitives, not app integrations.** Parity with a person comes
   from a computer with a signed-in browser, a voice bridge into any web call,
   and a phone. A Meet link, a Slack huddle, a Teams call and a Zoom web call
   all join the same way: the browser opens the call and the voice is its
   microphone (`packages/voice/src/meet/call.ts`). Meet has its own path today
   (`packages/voice/src/meet/join.ts`).
4. **One self, one memory.** Every session of the employee reads and writes
   the same self and the same memory, whoever talks to it and on any channel.
5. **Every rule is code.** Goals stage 1 showed written rules fail 4 of 7
   times (`../goals-and-workflows/README.md`). Discretion, approvals and
   spending limits are checks outside the model.

## The state model: where everything lives and how it aggregates

| State | Where | Written by | How parallel writes merge |
|---|---|---|---|
| Self: name, role, manager, values, rules, accounts | git: the workspace repo | the interview, then the employee through change requests | config release (one commit at a time) |
| Procedural memory: skills | git: `skills/` | the employee, through the learning gate (`../continual-learning/README.md`) | config release |
| Goals | git: the goals folder (`../goals-and-workflows/README.md`) | the interview, the employee, people | config release |
| Semantic memory: people, facts, projects, preferences | the workspace volume: one employee memory folder | every session | each session appends its own notes; one consolidation job merges them into the canonical files |
| Episodic memory: every event and every action | the event ledger plus session transcripts | the API and every session | append-only |
| Computer state: browser profile, cookies, logins, dotfiles | the workspace volume: one computer folder | the session that holds it | each worker gets a copy of the profile; on exit its cookies merge back by domain, newest wins |
| Secrets: passwords, TOTP seeds, later a card | the vault (secrets) | the employee, people | one value per key |

Today My Kortix memory is per viewer: `/Users/<viewer>/Memory/mykortix`
(`apps/api/src/memory/layers.ts:9`). The employee replaces it with one folder
for the workspace.

**Discretion is code, not prompt.** One memory does not mean that the employee
repeats a DM to the whole company. Each fact carries its source and its
audience (`public`, `team`, `private:<person>`). Recall in a conversation
returns only the facts whose audience includes everyone in that conversation.

## The mind and the workers: parallel without losing the thread

- **The mind** is one root session per employee, always on. Every inbound
  event lands in one feed: channel messages, email, calls, SMS, triggers,
  connector events, goal wake-ups (`apps/api/src/integrations/event-inbox.ts`
  is one of today's pieces). The mind never waits. It answers short things
  itself and starts a worker for anything else.
- **A worker** is one session per thread of work: one Slack thread, one email
  thread, one call, one goal. The worker that owns a thread hears its
  follow-ups first (`../long-horizon-runtime/README.md`). Workers run in
  parallel, each in its own sandbox, on the same git release and the same
  memory.
- **A call is a worker too.** The voice cascade answers in real time and the
  same session does the deep work (`packages/voice/README.md`).

## The action space: parity with a person

| A person has | The employee gets | Today |
|---|---|---|
| A work email | A real mailbox in the customer's Google Workspace or Microsoft 365, signed in as the user. A managed inbox when the customer has none | Managed inboxes exist (`apps/api/src/channels/email/installs.ts`) |
| A Slack and Teams seat | A real member account with a user token, not a bot | Bot only: `apps/api/src/config.ts:540-544` |
| Meetings, huddles, calls | Browser plus voice bridge into any web call; Meet by link | `voice_join_meet`, `voice_join_call`, flag `voice_call` (wip) |
| A phone | A number with calls and SMS, on the same voice cascade | None |
| 2FA | One `otp` tool: TOTP seeds from the vault, codes from SMS and email | None |
| A laptop with saved logins | A browser profile on the workspace volume that survives every session | None: state lives in the box only (`apps/sandbox/entrypoint.sh:42-47`) |
| A card | Later | None |

My Kortix's computer has no browser today (`apps/sandbox/MACHINE.md:44`). The
employee runs on the full computer.

## UX

- **Hire.** Offer (name, role, manager) → voice interview (context dump,
  files, screen share; a live list of what it learned) → accounts (identity,
  phone, Slack, Teams, tools; the employee sets up its own password and 2FA
  while you watch) → first day (it writes its first week and messages you).
- **Oversee.** Now (calls, browser, waiting), goals, approvals, the week in
  numbers, "watch its screen". No message box.
- The design canvas is the reference for these screens. It lives outside the
  repository; the PR links it.

## Phases

Each phase ends with a proof that runs on dev.

1. **One self, one memory, the mind.** Proof: a voice interview writes the
   self and the memory. Then two people write to it on Slack and on email.
   Both reach the same memory, the discretion check holds, and the mind runs
   two workers at once.
2. **Hire and oversee.** The employee workspace type behind flag
   `digital_employee` and the onboarding and oversight screens.
3. **The computer.** Persistent browser profile, a Slack and Teams member
   account, huddles and web calls through the browser.
4. **Phone, SMS, OTP.**
5. **Learning.** The continual-learning loop writes and tests skills.
6. **The brand front door** and the card.

## How this relates to other topics

This topic sequences work that is already planned:
`long-horizon-runtime` (the mind and the workers), `continual-learning`
(procedural memory), `goals-and-workflows` (goals),
`my-kortix-multi-agent-parity` (workers and messages between them),
`stateless-sessions` and `project-repository-access` (one volume per
workspace, the sandbox is disposable).

## Pick it up

Read `decisions.md` first. The canonical branch is `digital-employee`.
