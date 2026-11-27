---
title: The Kortix humanoid: a digital human with its own identity, one event log, one memory, and outcomes
status: spec (branch `digital-employee`); flag `humanoid`; phase 1 in progress
owner: Marko (decisions)
updated: 2026-11-27
---

# The Kortix humanoid

**The problem.** Kortix agents act only when a person opens a chat. They have
no identity of their own: no email, no phone, no logins that last, no second
factor. They borrow a person's connections. They forget between sessions. A
company wants to hire a colleague, not open a chat.

**The product.** You click **Create humanoid**. Kortix makes a workspace and
gives it a Base Identity: an email address, a phone number, an authenticator,
a browser that keeps its logins, and a Drive. You onboard it like a new hire:
invite its email to Slack, Teams or Google, and tell it what to do. It signs
up, signs in, sets up its own connectors and automations, and drives outcomes
around the clock. 1 humanoid = 1 Kortix workspace. My Kortix becomes the
humanoid.

## Principles

1. **One identity, used like a person uses one.** Every copy of the humanoid
   uses the same email, phone, browser, vault and memory. From outside it is
   one person.
2. **The browser is the default hand.** The humanoid uses any software
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
6. **The humanoid owns its state.** Its Drive holds everything about it. It
   writes outward only when someone needs to know.

## The architecture in one page

```
 inputs                       the ledger                    takers                      state
 ───────────────              ──────────────────            ──────────────────          ─────────────────
 Slack, Teams, email,  ──►    humanoid_events      ──►      the conversation    ◄──►    git: self, skills,
 SMS, calls, web chat         one row per event,            (one per person +           agents, triggers
 connector events             with a state:                 its own)                    (procedural)
 crons, schedules,            pending → routed |            working threads     ◄──►    volume: memory,
 webhooks, goals              digested | recorded           (one per piece of           journal, files
 finished threads             | dead                        work, in parallel)          (episodic, semantic)
 its own actions (out)                                      sleep (nightly)     ◄──►    the ledger itself
```

1. **One ledger.** Every input is one row in `humanoid_events` with a state:
   `pending` (waiting for the dispatcher), `routed` (a session took it),
   `digested` (sent to a conversation as part of a digest), `recorded` (kept
   for awareness or the humanoid's own action; nothing to deliver), `dead`
   (every attempt failed; shown to people). Nothing acts on an input that has
   no row. Crons, schedules, webhooks and
   connector events that the humanoid set up are inputs like a message: in an
   humanoid workspace a trigger fire writes an event, and the dispatcher hands
   it to a taker. The humanoid's own actions (a message sent, a call made) are
   rows too, so the ledger is the complete record of its life.
2. **Takers, not a chat loop.** Three kinds of sessions take events:
   - **The conversation.** One per person, plus the humanoid's own. It works
     like a WhatsApp chat: the humanoid reads what arrives and sends a
     message when it decides to. Silence is the default. Replying is an
     action (an outbound event), not the end of a turn.
   - **Working threads.** One per piece of work, in parallel, each in its own
     sandbox. They report into the conversation that started them.
   - **Sleep.** One nightly session (section 5).
3. **Three stores, no state in compute.** The ledger (Postgres), the volume
   (the Humanoid drive: memory, journal, files, browser backups) and git (self,
   skills, agents, triggers). A sandbox holds nothing that is not in one of
   them, so any number of sessions can run at once and any box can die.
4. **Scale and copies.** More work is more working threads; the dispatcher's
   per-subject order keeps one thread's events in sequence. A copy of an
   humanoid is a new workspace from its git config and a snapshot of its
   volume, with a new Base Identity. A proven humanoid becomes a starter
   template the same way.
5. **It compounds.** Every night, sleep turns the day's ledger and
   transcripts into memory (volume) and into better skills, agents and
   triggers (git, through change requests that pass the eval gate).

### Lessons from other proactive agents (2026-11-27)

Read: LangChain "What we've learned building proactive agents", xAI Grok Bot
1.0 and its design post, Devin automations, Meta Muse, Instinct (reviews),
Letta sleep-time compute (arXiv 2504.13171). None publishes how it stores
or retrieves memory, or how it queues many instances. What we take:

1. **A gate between the ledger and a wake.** Before an event wakes a
   session: a cheap rule or script, then a small model that sees only the
   event. A skip is a ledger state with its reason (`skipped`), so useful
   silence can be audited. LangChain's Slack agent and Devin's preflight both
   do this.
2. **Backpressure in the ledger.** A per-source hourly cap and a bounded
   queue per humanoid; an event over the bound is `dropped` with its reason,
   never lost silently. Dedup by upstream id plus a version; content hash as
   the fallback (Devin).
3. **Its own reminders and finished threads are events.** A follow-up it
   schedules for itself, and a working thread that finishes or needs input,
   wake the conversation through the ledger. Nothing polls (Devin's
   coordinator).
4. **An attention budget.** A message to a person is a one-line headline
   with detail on request. Each person sets how proactive it may be with
   them. The metric is the share of its messages that people act on
   (LangChain, Muse).
5. **Only sleep writes core memory.** Live sessions append notes and read
   memory; the sleep session, on a stronger model, merges, deduplicates,
   expires stale facts and resolves conflicts (Letta). Its inputs are traces,
   review feedback (rewrites, rejections) and outcomes (did the draft get a
   reply) (LangChain). Changes to git are change requests, never silent.
6. **An autonomy ladder.** Every approval decision is stored per action
   class; a class approved again and again stops asking (LangChain, Grok
   Bot "smarter approvals").
7. **Connector content is untrusted.** Mail, messages and pages can carry
   instructions. The humanoid uses credentials it cannot read, network
   access to new hosts needs approval, and an action that sends, pays or
   changes access goes through the approval check. Instinct's reported
   failures (obeying an email, an unchecked send, a password reset on its
   own) are what this prevents; Muse runs a separate approving process.
8. **Visible states.** The humanoid home shows each thread as idle,
   working, waiting, blocked or done, and a person can take over its
   browser and hand it back (Grok Bot).

## 1. The Base Identity

One record per humanoid, `kortix.humanoid_identities`, one row per project.
It points at each part; the secrets themselves stay in the vault.

| Part | What the humanoid gets | How Kortix provisions it | Today |
|---|---|---|---|
| Name | A first name and a role | The create form; default from a name list | None |
| Email | `<name>@<managed domain>`, inbound and outbound, threads, attachments | Resend inbox, created by `addEmailInbox` with `agentName: mykortix` | Exists, behind `RESEND_MANAGED_EMAIL_ENABLED` and flag `email_channel` |
| Phone | One number: SMS in and out, calls in and out on the voice cascade | Number bought by API from the phone provider; webhooks to a new `sms` channel and to the voice relay | None |
| Authenticator | TOTP for every account it secures; codes from SMS and email | Seeds in the vault (`project_secrets`, broker strategy); codes made server-side | None |
| Passwords | One strong password per account | Generated server-side, stored in the vault, typed by the browser tool, never shown to the model | Vault exists |
| Browser | One persistent Chromium: logins, cookies and IndexedDB survive; one residential IP; one fingerprint | One Platinum Browser per humanoid, residential proxy, stealth image, live view | Platinum Browsers exist; residential proxy exists for sandboxes only |
| Captcha | Solved without a person | A solver behind the browser tool, billed per solve | None |
| Drive | Everything about the humanoid | A project drive `Humanoid`, mounted in every humanoid session | Drives exist |
| Card | A prepaid card with limits | Card issuing by API, per humanoid | Later phase |

**Onboarding a company is an invite.** A person invites the humanoid's email
to Slack, Teams, Google Workspace, Notion, HubSpot or any tool. The invite is
an email event. The humanoid opens it in its browser, signs up as a real
member, saves the password and 2FA seed, and records the account in its
Drive. Slack and Teams seats are then real user seats, not bots.

**Email is the universal event bus.** A person learns about a DM, a mention,
a comment or an assigned task from a notification email. So does the
humanoid: notification mail from any tool is an event in its log, even for a
tool with no API and no connector. Connectors and webhooks add faster and
richer events where they exist.

### The accounts ledger

Every account the humanoid creates is one row in `kortix.humanoid_accounts`:
site, login, the vault reference of the password, the 2FA method and its
vault reference, the creation time, the last successful sign-in, and its
state (`active`, `locked`, `needs_person`). The Drive keeps a readable copy
(`/Humanoid/Accounts.md`). The humanoid checks this ledger before it signs up
anywhere, so it never makes a second account.

### The authenticator

- `kortix otp add` takes an `otpauth://` URI or a QR screenshot and stores the
  seed in the vault. The seed never enters the model's context.
- `kortix otp code <account>` returns the current 6-digit code.
- `kortix otp wait --via sms|email [--from <sender>]` waits for the next code
  that arrives by SMS or email and returns only the code. It reads the event
  log.
- Passkeys: a CDP virtual authenticator in the humanoid's browser. This is a
  later step.

### The browser

The browser is one long-lived Chromium per humanoid, on Platinum. It is the
humanoid's laptop.

- **One identity in parallel.** Every copy connects to the same browser over
  CDP, through a short-lived URL that the API mints per session. Each copy
  works in its own tab. All tabs share the same cookies, so one login serves
  every copy.
- **Logins last.** The browser's disk keeps the full profile, IndexedDB and
  service workers included. A nightly job also saves the cookies and
  localStorage to a Platinum saved profile, as a backup.
- **Looks like a person.** One sticky residential IP per humanoid, from one
  country. The timezone and locale match that IP. The browser runs with a
  display (not headless), real fonts and a stable fingerprint. Required
  Platinum work: `network.residential_proxy` on browsers, a stealth image
  option, and a live view.
- **Watch its screen.** The humanoid home shows the browser live. A person
  can take over to clear a step the humanoid cannot.
- **The agent tool.** `agent-browser --cdp` against the humanoid browser.
  The skill teaches the sign-up, sign-in and 2FA flows, the accounts ledger,
  and when to stop and ask a person.

### Vendor choices (research 2026-11-27)

Evidence and sources: the session research file `identity-vendors.md`; the
numbers below are from vendor pages unless marked.

| Part | Choice | Why | Unverified |
|---|---|---|---|
| Browser | Headful Chromium under Xvfb on Platinum, real fonts, WebGL not SwiftShader, no `Runtime.enable` leak (Patchright-style), timezone/locale/WebRTC pinned to the residential exit, generated mouse and keyboard input | A 2026-11-24 benchmark (arXiv 2611.31962, 80 tasks, 11 bot-defense families) reached 2% of pages with local headless (our setup today), 50% headful, 68–77% with Kernel, Anchor and Browser Use Cloud, 89% with a forked Chromium plus generated input | Our own pass rate: measure against our top-20 SaaS sign-up list before and after |
| Fallback browser | Kernel or Browser Use Cloud (hosted stealth, built-in captcha) | Highest hosted pass rates in the same benchmark | Their stealth tier in that benchmark |
| Email | Resend inbox on the managed domain (today); a Google Workspace seat on the customer's domain when the humanoid needs "Sign in with Google" | Resend: $1/inbox/month after 3. Workspace users are created by API (`users.insert`); no API creates a consumer Google account | Google's "verify it's you" challenge on a new device can be lifted for 10 minutes only |
| Phone | Test Telnyx Mobile Voice (eSIM, $5/month, US, beta): a real carrier number by API | VoIP numbers (Twilio, Telnyx local) are labelled `fixedVoip`/`nonFixedVoip` by line-type lookups and refused for SMS 2FA by many services | Whether SMS to the eSIM reaches the API with no handset, and its lookup line type |
| Authenticator | TOTP seeds in the vault, codes by RFC 6238 server-side; passkeys via the CDP WebAuthn virtual authenticator, credential exported to the vault and re-added on each browser start | Both work by API | Sites that check the authenticator type |
| Captcha | CapSolver by API ($0.8–1.2 per 1,000), 2Captcha as fallback; hCaptcha is the weak spot | Cheapest; AI-solved | CapSolver's own pricing page (404 when read) |
| Card | Stripe Issuing: one virtual card per humanoid ($0.10), MCC locks, per-purchase and monthly limits, real-time approval webhook | Fits per-humanoid limits and approvals | Platform program terms for customers' humanoids |

**Terms that limit the humanoid, whatever the technology:** LinkedIn's User
Agreement 8.2 forbids a profile for anyone but a real person and automated
access. Paid captcha solving breaks most protected sites' terms. The humanoid
skill names these and asks a person instead.

## 2. The event log

A permanent, append-only log per humanoid: `kortix.humanoid_events`.

| Column | Content |
|---|---|
| `id` | ULID, ordered by arrival |
| `project_id` | The humanoid's workspace |
| `source` | `email`, `slack`, `teams`, `sms`, `call`, `connector:<app>`, `webhook`, `schedule`, `goal`, `session`, `browser`, `person` |
| `type` | `<source>.<object>.<verb>`, for example `email.message.received` |
| `subject` | The thread key: one email thread, one Slack thread, one phone number, one goal |
| `external_id` | The upstream id; unique with `project_id` and `source`, so a redelivery is a no-op |
| `occurred_at`, `received_at` | Upstream time and arrival time |
| `actor` | Who caused it: a member, an outside address or number, the humanoid itself |
| `audience` | `public`, `team` or `private:<person>`: who may see it later |
| `summary` | One line for the dispatcher and the digest, made by code |
| `payload` | The event body, or a pointer to it when large |
| `routed_to` | The session that took it, and when |

- **Write first, then act.** An adapter writes the row in the same transaction
  as the dispatch job (`kortix.job_queue`, queue `humanoid.dispatch`, ordered
  per `subject`). If the dispatch fails, the event stays and is retried; after
  the last attempt it is dead-lettered and shown on the humanoid home.
- **Adapters.** Each existing ingress gets one call, `recordHumanoidEvent`,
  when the project has the `humanoid` flag:
  - email: `handleEmailEvent` (already on the durable inbox);
  - Slack and Teams: after the webhook dedup claim;
  - connector events: `deliverEvents` (Composio push, MCP polls);
  - schedules and reminders: `fireGitTrigger`;
  - goal wakes: `wakeGoal` and the heartbeat;
  - session ends: the turn-end hooks;
  - SMS and calls: the new phone channel.
- **Kept for good.** Unlike `job_queue` rows, events are never pruned while the
  humanoid exists. They are the episodic memory.

## 3. The dispatcher, the conversation and the working threads

**Everything goes through the log, both ways.** Every inbound message and
event is written to the log first; only the dispatcher acts on it. Every
outbound action (a reply, a sent mail, an SMS, a post) is also an event, so
the log holds both sides of every conversation.

**Two kinds of sessions.**

- **The conversation.** You talk to the humanoid in one regular, ongoing
  conversation: the web chat, your DM with it, or a call. It answers short
  things itself and hands real work to a working thread. One conversation per
  person; the humanoid's own conversation (the mind) gets everything nobody
  addressed to it.
- **Working threads.** One session per piece of work: one email thread, one
  Slack thread, one task, one outcome. They run in parallel and in the
  background, and report back into the conversation that started them.

The dispatcher is code. For each event, in order per subject:

1. **A session owns the subject** (a chat thread binding, an email thread, a
   goal's owner): deliver the event to it as a follow-up.
2. **The event is addressed to the humanoid** (a DM, a mention, mail to its
   address, an SMS, a call): start a worker session for the subject, bind it,
   deliver the event.
3. **Everything else** (connector events, schedules, notifications it was not
   addressed in): add it to the mind's digest.

**The mind** is one always-addressable session per humanoid. It receives the
digest every few minutes, never waits, and decides: ignore, note in memory,
or start a worker with the `agent` tool. **Workers** are the humanoid itself
on one thread or one task each, in parallel, each in its own sandbox, all on
the same identity, Drive and memory. Every turn, a worker sees the live list
of the other workers ("now"), so two copies never do the same work or
contradict each other.

## 4. Day one: the default action space

The moment a humanoid is created, it has every base capability without a
person setting anything up, and its first job is to make itself autonomous.

**Configured by Kortix at create:** the Base Identity; the `humanoid` flag;
My Kortix as the default agent with every tool; the humanoid skills
(identity, accounts, authenticator, browser, event log, self-configuration);
the Humanoid drive; and three built-in schedules: a morning plan, the
nightly review (section 5), and a weekly harness review.

**Configured by the humanoid on its first run:** it reads its self and its
outcomes, then sets up what makes it autonomous for this company: connector
watches for the tools it was invited to, triggers and schedules for recurring
work, agents for repeated jobs, and API keys where an API is faster than the
browser. It records each choice in its Drive. It asks a person only for what
it cannot do alone: an invite, an approval, a payment.

## 5. Memory

| Memory | Holds | Where | Written by |
|---|---|---|---|
| Working | The current task | The session | The session |
| Episodic | Every event and every action, in order | `humanoid_events` plus session logs | Adapters and sessions (append only) |
| Semantic | Facts about people, the company, its accounts and itself, each with audience and source | `/Humanoid/Memory/facts/` | Sessions append notes; the consolidation job merges |
| Procedural | Skills: how it does things here | `skills/` in git | The reflection job, through a change request |
| Self | Name, role, manager, rules, goals | `humanoid/self.md` in git | The interview, then change requests |

**Recall.** Every turn gets the self, the "now" list and an index of facts
whose audience covers everyone in the conversation. `kortix memory search`
searches facts and the event log on demand. A copy never compacts its context
away: it rebuilds what it needs from the log.

**Discretion is code.** A fact or event with audience `private:<person>` is
returned only in a conversation where that person is the only other
participant.

**Reflection: the nightly review.** A worker job starts one reflection session
per humanoid per night. It reads the day's events and every session log, then:

1. merges the day's notes into facts (the single writer of semantic memory);
2. writes a diary entry to `/Humanoid/Journal/<date>.md`: what happened, what
   failed, what it learned;
3. proposes new or changed skills as a change request; a skill is kept only
   if it passes replay of the past cases it covers;
4. checks open outcomes and plans the next day.

**Harness review, weekly.** One session reviews the week's failures, slow
paths and repeated work across all sessions, and changes the humanoid's own
setup: prompts in `self.md`, agents, triggers and skills, each through a
change request that its eval gate checks before merge.

## 6. Outcomes

The humanoid is hired for outcomes. An outcome extends Kortix Goals
(`project_goals`): a statement, a metric read from the source system by the
platform, a baseline, a target and a deadline, guardrails, an owner, a
budget, and approval limits. People assign outcomes in chat, in a task tool,
or on the humanoid home. The humanoid can work inside a team's task tool,
but it keeps its own state in its log, memory and goals, and writes outward
only when someone needs to know. A separate verifier, blind to the actor's
transcript, decides when an outcome is met.

## 7. The Drive

One project drive named `Humanoid`, mounted read-write in every humanoid
session at `/drives/humanoid`:

```
/Humanoid
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

- **Create humanoid.** One click on the workspaces page: name and role,
  optional. A live checklist shows each part of the Base Identity as it is
  provisioned. The last step shows its email and phone and says: "Invite
  <name>@… to your tools and tell it what to do."
- **The humanoid home** replaces the workspace home for humanoid workspaces:
  identity card, now (live workers and the browser screen), outcomes,
  approvals, the event feed, accounts. No chat box: people talk to it in
  their tools, by email, SMS or a call. A call button stays.

## 9. Phases

Each phase ends with a proof on dev, from a real input to a real result.

1. **Event log, dispatcher, humanoid create, email.** Flag `humanoid`. Proof:
   an email to the humanoid's address and a Slack mention land in the log,
   each starts its own worker, a follow-up in either thread reaches the same
   worker, and a connector event reaches the mind's digest.
2. **The authenticator, the vault ledger, the Drive.** Proof: the humanoid
   signs up to a web app by email, sets up TOTP, and signs in again the next
   day with no person.
3. **The browser.** One Platinum Browser per humanoid with residential IP,
   stealth and live view; parallel copies share it. Proof: it accepts a Slack
   invite by email, becomes a real member, and answers a DM as a user.
4. **Memory and reflection.** Facts with audience, the nightly review, skills
   by change request. Proof: a fact told in a DM is used for that person and
   never told to another; a task it failed once, it does right the next week.
5. **Phone and captcha.** Proof: it texts and calls a number, and passes an
   SMS 2FA and a captcha on sign-up.
6. **Outcomes and the humanoid home.** Proof: one outcome on a real metric
   moves through measure, plan, dispatch, verify and report with no prompt.
7. **The card.** Proof: a purchase under the limit goes through; one above it
   waits for approval.

## Pick it up

Read `decisions.md`, then `phase-1-plan.md`. The canonical branch is
`digital-employee`, worktree `../suna-digital-employee`.
