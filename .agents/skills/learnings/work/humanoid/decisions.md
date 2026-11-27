# Decisions: digital employee

## Decided

- **2026-11-26 (Marko)** The product is My Kortix as a product: a 24/7,
  proactive digital employee across engineering, marketing, sales, ops and
  finance. 1 employee = 1 workspace.
- **2026-11-26 (Marko)** Onboarding is the core of the product. It works like
  a real employee onboarding, and voice is central. The UX is minimal.
- **2026-11-26 (Marko)** Conversation runs through the human channels, not
  the app.
- **2026-11-26 (Marko)** 100% human emulation: real user accounts (Slack and
  Teams members, not bots), its own email, phone, 2FA and browser. It joins
  any call it is sent: Meet, huddle, Teams.
- **2026-11-26 (Marko)** One aggregated memory, perfect parallelism, and
  state on the volume and in git.
- **2026-11-26 (Marko)** Payments come later.
- **2026-11-26** It is built in this repository, on the Kortix engine. The
  harness work is in kortixd and the API, so a separate repository would
  only hold UI. A branded front door can sit on top later.
- **2026-11-26** It is a new employee workspace type behind flag
  `digital_employee`. Existing workspaces and My Kortix do not change until
  it proves itself.
- **2026-11-26** Discretion over the one memory is a code check on each
  fact's audience, not a prompt rule.
- **2026-11-26** Parity comes from general primitives (browser, voice bridge,
  phone), never from one integration per app.

## Open

- **D1 (Marko)** Name: Autonomy.INC or Mirko.ai, and the default employee
  name (the design uses "Otto").

## Decided (later the same day)

- **2026-11-26 (Marko)** It is one autonomous cognitive being with its own
  identity that scales itself without limit, seen from outside as one
  employee. It has the same action space as a person, end to end.
- **2026-11-26** Every worker is the employee itself: same self, memory,
  accounts and voice. A live self-state lets every copy see what the others
  do.
- **2026-11-26** The parity checklist in `README.md` is the definition of
  done. Each row becomes an agent eval task.

## Decided: identity and billing (2026-11-26)

- **2026-11-26 (Marko)** The unit is the employee identity. Each employee you
  create holds its self, its memory, its accounts, its model access and its
  authorisations. Everything an employee can do or spend hangs off it.
- **2026-11-26 (Marko)** Customers connect what they already pay for: a
  Claude plan, a ChatGPT/Codex plan, or API keys of any provider. Kortix
  keeps its usage billing: compute is metered, tokens carry a percentage fee.
  Today's rules: managed models at cost + 5.5% (`LLM_PLATFORM_FEE_PERCENT`,
  `apps/api/src/billing/services/tiers.ts`); own API keys free up to 1,000 a
  month, then 5% (`apps/api/src/billing/services/byok-fee.ts`); ChatGPT and
  OpenCode Go plans exempt.
- **2026-11-26** Model access is bound to the employee, not to the person
  who talks to it. A plan connected by one person serves only the work that
  person asks for. A shared employee runs on workspace API keys or managed
  models. Reason: a personal Claude plan used by a whole team is account
  sharing, and storing and forwarding Claude logins needs a terms review.

## Open

- **D2** Legal review of Claude plan passthrough against Anthropic's terms
  before it is sold as an employee feature.

## Decided: one employee first (2026-11-26)

- **2026-11-26 (Marko, recommended)** Start with one general employee per
  company. It builds its own agents, automations, triggers and skills, and
  they belong to it: they act under its identity, its permissions and its
  budget, and report into its memory. They are its tools, never separate
  colleagues.
- A second employee is a second workspace, added only for a real boundary:
  different permissions or audit (finance), a different face to outsiders
  (support), a separate budget, or memory that must not mix between teams.
- **2026-11-26 (Marko)** 1 employee = 1 Kortix workspace, and the employee is
  whatever its onboarding makes it. There are no fixed role types. The
  interview writes the self, the goals and the rules, and picks the starting
  skills and connectors from the starter templates
  (`packages/starter/templates/`) as a kit, never as a product the customer
  chooses.

## Decided: Kortix core and the Base Identity (2026-11-27)

- **2026-11-26 (Marko)** No separate product or brand. Every Kortix workspace
  is one long-horizon employee; this is the new core UX of Kortix, and My
  Kortix becomes the employee. This replaces the "new employee workspace
  type" entry above. The flag is `employee`.
- **2026-11-27 (Marko)** One click creates an employee with a Base Identity:
  email, phone, an authenticator, a captcha solver, a browser that looks like
  a person, a Drive that stores everything about it, and later a card.
- **2026-11-27 (Marko)** The browser is the employee's primary way to use
  software. It sets up API keys, connectors and automations itself where they
  help; the browser is the fallback for everything else.
- **2026-11-27 (Marko)** Onboarding to a company is an invite to the
  employee's email plus an instruction. It self-onboards: creates its own
  channel, asks stakeholders, pings proactively.
- **2026-11-27 (Marko)** It drives outcomes assigned by people, can work in a
  task tool, keeps its own state, and writes outward only when needed.
- **2026-11-27 (Marko)** Memory is episodic, semantic and procedural, with a
  self-reflection job that reviews every session, on a write-ahead event log.
- **2026-11-27** The event log is a permanent table; dispatch rides on the job
  queue. Channels keep their thread routing in phase 1 (`phase-1-plan.md`).
- **2026-11-27** The browser is one Platinum Browser per employee, shared by
  all copies over CDP, with a residential IP. Platinum needs residential proxy
  and a stealth option on browsers.
- **2026-11-27** Notification email from any tool is an event, so the
  employee hears about tools that have no API, as a person does.

## Open (2026-11-27)

- **D3 (Marko)** The phone provider and which Kortix account pays for numbers
  (see the vendor research).
- **D4 (Marko)** Captcha solving: accept the terms-of-service risk, and which
  vendor.
- **D5 (Marko)** Managed email cost: bill the customer per employee inbox, or
  absorb it.

## Decided: the name (2026-11-27)

- **2026-11-27 (Marko)** The product is called **Humanoid** ("digital
  humanoid" in a first line, since the word also names physical robots). One
  term everywhere: the flag `humanoid`, `kortix humanoid`, the tables
  `humanoid_identities` and `humanoid_events`, the routes `/humanoid*`, the
  Humanoid drive. Entries above this one say "employee" and mean the same
  thing. The branch keeps its name, `digital-employee`. D1 is closed.
