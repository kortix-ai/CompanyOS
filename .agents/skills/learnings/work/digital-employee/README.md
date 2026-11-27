---
title: The Kortix employee: a digital human with its own identity, one event log, one memory, and outcomes
status: spec (branch `digital-employee`); flag `employee`; phase 1 in progress
owner: Marko (decisions)
updated: 2026-11-27
---

# The Kortix employee

**The problem.** Kortix agents act only when a person opens a chat. They have
no identity of their own: no email, no phone, no logins that last, no second
factor. They borrow a person's connections. They forget between sessions. A
company wants to hire a colleague, not open a chat.

**The product.** You click **Create employee**. Kortix makes a workspace and
gives it a Base Identity: an email address, a phone number, an authenticator,
a browser that keeps its logins, and a Drive. You onboard it like a new hire:
invite its email to Slack, Teams or Google, and tell it what to do. It signs
up, signs in, sets up its own connectors and automations, and drives outcomes
around the clock. 1 employee = 1 Kortix workspace. My Kortix becomes the
employee.

## Principles

1. **One identity, used like a person uses one.** Every copy of the employee
   uses the same email, phone, browser, vault and memory. From outside it is
   one person.
2. **The browser is the default hand.** The employee uses any software
   through its browser, as a person does. It then sets up API keys,
   connectors and automations where they make it faster or more reliable.
   The browser stays the fallback for everything without an API.
3. **Every input is an event in one log.** Messages, mail, SMS, calls,
   connector events, schedules, goal wakes and finished sessions all land in
   one append-only log before anything acts on them.
4. **Code decides routing, the model decides work.** The dispatcher is
   deterministic. The model never chooses whether an event is stored or lost.
5. **Every rule that matters is code.** Discretion, approvals, spend caps,
   2FA seeds and passwords are enforced outside the model. Written rules
   failed 4 of 7 times in the Goals live runs.
6. **The employee owns its state.** Its Drive holds everything about it. It
   writes outward only when someone needs to know.

## 1. The Base Identity

One record per employee, `kortix.employee_identities`, one row per project.
It points at each part; the secrets themselves stay in the vault.

| Part | What the employee gets | How Kortix provisions it | Today |
|---|---|---|---|
| Name | A first name and a role | The create form; default from a name list | None |
| Email | `<name>@<managed domain>`, inbound and outbound, threads, attachments | Resend inbox, created by `addEmailInbox` with `agentName: mykortix` | Exists, behind `RESEND_MANAGED_EMAIL_ENABLED` and flag `email_channel` |
| Phone | One number: SMS in and out, calls in and out on the voice cascade | Number bought by API from the phone provider; webhooks to a new `sms` channel and to the voice relay | None |
| Authenticator | TOTP for every account it secures; codes from SMS and email | Seeds in the vault (`project_secrets`, broker strategy); codes made server-side | None |
| Passwords | One strong password per account | Generated server-side, stored in the vault, typed by the browser tool, never shown to the model | Vault exists |
| Browser | One persistent Chromium: logins, cookies and IndexedDB survive; one residential IP; one fingerprint | One Platinum Browser per employee, residential proxy, stealth image, live view | Platinum Browsers exist; residential proxy exists for sandboxes only |
| Captcha | Solved without a person | A solver behind the browser tool, billed per solve | None |
| Drive | Everything about the employee | A project drive `Employee`, mounted in every employee session | Drives exist |
| Card | A prepaid card with limits | Card issuing by API, per employee | Later phase |

**Onboarding a company is an invite.** A person invites the employee's email
to Slack, Teams, Google Workspace, Notion, HubSpot or any tool. The invite is
an email event. The employee opens it in its browser, signs up as a real
member, saves the password and 2FA seed, and records the account in its
Drive. Slack and Teams seats are then real user seats, not bots.

**Email is the universal event bus.** A person learns about a DM, a mention,
a comment or an assigned task from a notification email. So does the
employee: notification mail from any tool is an event in its log, even for a
tool with no API and no connector. Connectors and webhooks add faster and
richer events where they exist.

### The accounts ledger

Every account the employee creates is one row in `kortix.employee_accounts`:
site, login, the vault reference of the password, the 2FA method and its
vault reference, the creation time, the last successful sign-in, and its
state (`active`, `locked`, `needs_person`). The Drive keeps a readable copy
(`/Employee/Accounts.md`). The employee checks this ledger before it signs up
anywhere, so it never makes a second account.

### The authenticator

- `kortix otp add` takes an `otpauth://` URI or a QR screenshot and stores the
  seed in the vault. The seed never enters the model's context.
- `kortix otp code <account>` returns the current 6-digit code.
- `kortix otp wait --via sms|email [--from <sender>]` waits for the next code
  that arrives by SMS or email and returns only the code. It reads the event
  log.
- Passkeys: a CDP virtual authenticator in the employee's browser. This is a
  later step.

### The browser

The browser is one long-lived Chromium per employee, on Platinum. It is the
employee's laptop.

- **One identity in parallel.** Every copy connects to the same browser over
  CDP, through a short-lived URL that the API mints per session. Each copy
  works in its own tab. All tabs share the same cookies, so one login serves
  every copy.
- **Logins last.** The browser's disk keeps the full profile, IndexedDB and
  service workers included. A nightly job also saves the cookies and
  localStorage to a Platinum saved profile, as a backup.
- **Looks like a person.** One sticky residential IP per employee, from one
  country. The timezone and locale match that IP. The browser runs with a
  display (not headless), real fonts and a stable fingerprint. Required
  Platinum work: `network.residential_proxy` on browsers, a stealth image
  option, and a live view.
- **Watch its screen.** The employee home shows the browser live. A person
  can take over to clear a step the employee cannot.
- **The agent tool.** `agent-browser --cdp` against the employee browser.
  The skill teaches the sign-up, sign-in and 2FA flows, the accounts ledger,
  and when to stop and ask a person.

### Vendor choices (research 2026-11-27)

Evidence and sources: the session research file `identity-vendors.md`; the
numbers below are from vendor pages unless marked.

| Part | Choice | Why | Unverified |
|---|---|---|---|
| Browser | Headful Chromium under Xvfb on Platinum, real fonts, WebGL not SwiftShader, no `Runtime.enable` leak (Patchright-style), timezone/locale/WebRTC pinned to the residential exit, generated mouse and keyboard input | A 2026-11-24 benchmark (arXiv 2611.31962, 80 tasks, 11 bot-defense families) reached 2% of pages with local headless (our setup today), 50% headful, 68–77% with Kernel, Anchor and Browser Use Cloud, 89% with a forked Chromium plus generated input | Our own pass rate: measure against our top-20 SaaS sign-up list before and after |
| Fallback browser | Kernel or Browser Use Cloud (hosted stealth, built-in captcha) | Highest hosted pass rates in the same benchmark | Their stealth tier in that benchmark |
| Email | Resend inbox on the managed domain (today); a Google Workspace seat on the customer's domain when the employee needs "Sign in with Google" | Resend: $1/inbox/month after 3. Workspace users are created by API (`users.insert`); no API creates a consumer Google account | Google's "verify it's you" challenge on a new device can be lifted for 10 minutes only |
| Phone | Test Telnyx Mobile Voice (eSIM, $5/month, US, beta): a real carrier number by API | VoIP numbers (Twilio, Telnyx local) are labelled `fixedVoip`/`nonFixedVoip` by line-type lookups and refused for SMS 2FA by many services | Whether SMS to the eSIM reaches the API with no handset, and its lookup line type |
| Authenticator | TOTP seeds in the vault, codes by RFC 6238 server-side; passkeys via the CDP WebAuthn virtual authenticator, credential exported to the vault and re-added on each browser start | Both work by API | Sites that check the authenticator type |
| Captcha | CapSolver by API ($0.8–1.2 per 1,000), 2Captcha as fallback; hCaptcha is the weak spot | Cheapest; AI-solved | CapSolver's own pricing page (404 when read) |
| Card | Stripe Issuing: one virtual card per employee ($0.10), MCC locks, per-purchase and monthly limits, real-time approval webhook | Fits per-employee limits and approvals | Platform program terms for customers' employees |

**Terms that limit the employee, whatever the technology:** LinkedIn's User
Agreement 8.2 forbids a profile for anyone but a real person and automated
access. Paid captcha solving breaks most protected sites' terms. The employee
skill names these and asks a person instead.

## 2. The event log

A permanent, append-only log per employee: `kortix.employee_events`.

| Column | Content |
|---|---|
| `id` | ULID, ordered by arrival |
| `project_id` | The employee's workspace |
| `source` | `email`, `slack`, `teams`, `sms`, `call`, `connector:<app>`, `webhook`, `schedule`, `goal`, `session`, `browser`, `person` |
| `type` | `<source>.<object>.<verb>`, for example `email.message.received` |
| `subject` | The thread key: one email thread, one Slack thread, one phone number, one goal |
| `external_id` | The upstream id; unique with `project_id` and `source`, so a redelivery is a no-op |
| `occurred_at`, `received_at` | Upstream time and arrival time |
| `actor` | Who caused it: a member, an outside address or number, the employee itself |
| `audience` | `public`, `team` or `private:<person>`: who may see it later |
| `summary` | One line for the dispatcher and the digest, made by code |
| `payload` | The event body, or a pointer to it when large |
| `routed_to` | The session that took it, and when |

- **Write first, then act.** An adapter writes the row in the same transaction
  as the dispatch job (`kortix.job_queue`, queue `employee.dispatch`, ordered
  per `subject`). If the dispatch fails, the event stays and is retried; after
  the last attempt it is dead-lettered and shown on the employee home.
- **Adapters.** Each existing ingress gets one call, `recordEmployeeEvent`,
  when the project has the `employee` flag:
  - email: `handleEmailEvent` (already on the durable inbox);
  - Slack and Teams: after the webhook dedup claim;
  - connector events: `deliverEvents` (Composio push, MCP polls);
  - schedules and reminders: `fireGitTrigger`;
  - goal wakes: `wakeGoal` and the heartbeat;
  - session ends: the turn-end hooks;
  - SMS and calls: the new phone channel.
- **Kept for good.** Unlike `job_queue` rows, events are never pruned while the
  employee exists. They are the episodic memory.

## 3. The dispatcher, the conversation and the working threads

**Everything goes through the log, both ways.** Every inbound message and
event is written to the log first; only the dispatcher acts on it. Every
outbound action (a reply, a sent mail, an SMS, a post) is also an event, so
the log holds both sides of every conversation.

**Two kinds of sessions.**

- **The conversation.** You talk to the employee in one regular, ongoing
  conversation: the web chat, your DM with it, or a call. It answers short
  things itself and hands real work to a working thread. One conversation per
  person; the employee's own conversation (the mind) gets everything nobody
  addressed to it.
- **Working threads.** One session per piece of work: one email thread, one
  Slack thread, one task, one outcome. They run in parallel and in the
  background, and report back into the conversation that started them.

The dispatcher is code. For each event, in order per subject:

1. **A session owns the subject** (a chat thread binding, an email thread, a
   goal's owner): deliver the event to it as a follow-up.
2. **The event is addressed to the employee** (a DM, a mention, mail to its
   address, an SMS, a call): start a worker session for the subject, bind it,
   deliver the event.
3. **Everything else** (connector events, schedules, notifications it was not
   addressed in): add it to the mind's digest.

**The mind** is one always-addressable session per employee. It receives the
digest every few minutes, never waits, and decides: ignore, note in memory,
or start a worker with the `agent` tool. **Workers** are the employee itself
on one thread or one task each, in parallel, each in its own sandbox, all on
the same identity, Drive and memory. Every turn, a worker sees the live list
of the other workers ("now"), so two copies never do the same work or
contradict each other.

## 4. Day one: the default action space

The moment an employee is created, it has every base capability without a
person setting anything up, and its first job is to make itself autonomous.

**Configured by Kortix at create:** the Base Identity; the `employee` flag;
My Kortix as the default agent with every tool; the employee skills
(identity, accounts, authenticator, browser, event log, self-configuration);
the Employee drive; and three built-in schedules: a morning plan, the
nightly review (section 5), and a weekly harness review.

**Configured by the employee on its first run:** it reads its self and its
outcomes, then sets up what makes it autonomous for this company: connector
watches for the tools it was invited to, triggers and schedules for recurring
work, agents for repeated jobs, and API keys where an API is faster than the
browser. It records each choice in its Drive. It asks a person only for what
it cannot do alone: an invite, an approval, a payment.

## 5. Memory

| Memory | Holds | Where | Written by |
|---|---|---|---|
| Working | The current task | The session | The session |
| Episodic | Every event and every action, in order | `employee_events` plus session logs | Adapters and sessions (append only) |
| Semantic | Facts about people, the company, its accounts and itself, each with audience and source | `/Employee/Memory/facts/` | Sessions append notes; the consolidation job merges |
| Procedural | Skills: how it does things here | `skills/` in git | The reflection job, through a change request |
| Self | Name, role, manager, rules, goals | `employee/self.md` in git | The interview, then change requests |

**Recall.** Every turn gets the self, the "now" list and an index of facts
whose audience covers everyone in the conversation. `kortix memory search`
searches facts and the event log on demand. A copy never compacts its context
away: it rebuilds what it needs from the log.

**Discretion is code.** A fact or event with audience `private:<person>` is
returned only in a conversation where that person is the only other
participant.

**Reflection: the nightly review.** A worker job starts one reflection session
per employee per night. It reads the day's events and every session log, then:

1. merges the day's notes into facts (the single writer of semantic memory);
2. writes a diary entry to `/Employee/Journal/<date>.md`: what happened, what
   failed, what it learned;
3. proposes new or changed skills as a change request; a skill is kept only
   if it passes replay of the past cases it covers;
4. checks open outcomes and plans the next day.

**Harness review, weekly.** One session reviews the week's failures, slow
paths and repeated work across all sessions, and changes the employee's own
setup: prompts in `self.md`, agents, triggers and skills, each through a
change request that its eval gate checks before merge.

## 6. Outcomes

The employee is hired for outcomes. An outcome extends Kortix Goals
(`project_goals`): a statement, a metric read from the source system by the
platform, a baseline, a target and a deadline, guardrails, an owner, a
budget, and approval limits. People assign outcomes in chat, in a task tool,
or on the employee home. The employee can work inside a team's task tool,
but it keeps its own state in its log, memory and goals, and writes outward
only when someone needs to know. A separate verifier, blind to the actor's
transcript, decides when an outcome is met.

## 7. The Drive

One project drive named `Employee`, mounted read-write in every employee
session at `/drives/employee`:

```
/Employee
  Identity.md          name, role, email, phone, browser, country
  Accounts.md          readable copy of the accounts ledger (no secrets)
  Memory/facts/        semantic memory, one fact per file
  Memory/notes/        notes from sessions, merged nightly
  Journal/<date>.md    the nightly review
  Outcomes/            one file per outcome: plan, progress, evidence
  Files/               everything it downloads or makes
  Browser/             profile backups and screenshots of key steps
```

## 8. UX

- **Create employee.** One click on the workspaces page: name and role,
  optional. A live checklist shows each part of the Base Identity as it is
  provisioned. The last step shows its email and phone and says: "Invite
  <name>@… to your tools and tell it what to do."
- **The employee home** replaces the workspace home for employee workspaces:
  identity card, now (live workers and the browser screen), outcomes,
  approvals, the event feed, accounts. No chat box: people talk to it in
  their tools, by email, SMS or a call. A call button stays.

## 9. Phases

Each phase ends with a proof on dev, from a real input to a real result.

1. **Event log, dispatcher, employee create, email.** Flag `employee`. Proof:
   an email to the employee's address and a Slack mention land in the log,
   each starts its own worker, a follow-up in either thread reaches the same
   worker, and a connector event reaches the mind's digest.
2. **The authenticator, the vault ledger, the Drive.** Proof: the employee
   signs up to a web app by email, sets up TOTP, and signs in again the next
   day with no person.
3. **The browser.** One Platinum Browser per employee with residential IP,
   stealth and live view; parallel copies share it. Proof: it accepts a Slack
   invite by email, becomes a real member, and answers a DM as a user.
4. **Memory and reflection.** Facts with audience, the nightly review, skills
   by change request. Proof: a fact told in a DM is used for that person and
   never told to another; a task it failed once, it does right the next week.
5. **Phone and captcha.** Proof: it texts and calls a number, and passes an
   SMS 2FA and a captcha on sign-up.
6. **Outcomes and the employee home.** Proof: one outcome on a real metric
   moves through measure, plan, dispatch, verify and report with no prompt.
7. **The card.** Proof: a purchase under the limit goes through; one above it
   waits for approval.

## Pick it up

Read `decisions.md`, then `phase-1-plan.md`. The canonical branch is
`digital-employee`, worktree `../suna-digital-employee`.
