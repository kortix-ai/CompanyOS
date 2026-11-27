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

## Decided: identity = connectors, built on core primitives (2026-11-27)

- **2026-11-27 (Marko)** No Humanoid-only tools and no Humanoid-only API
  routes. The Humanoid is a built-in agent plus a built-in YAML bundle, and its
  identity is the set of accounts it owns. Connector profiles group them.
  The `/humanoid*` routes, `kortix humanoid` and `humanoid_identities` on this
  branch are to be removed when the bundle lands.
- **2026-11-27** The identity building blocks are three Kortix-built MCP
  connectors, served in-process by the API (`apps/api/src/connectors/kortix-agent/`),
  like the Google servers. The gateway gives them approvals, rules, grants and
  the call log for free. There is no migration.
  - `kortix_agent_authenticator` (RFC 6238 TOTP): `add_account`,
    `list_accounts`, `get_code`, `remove_account`. Secrets never leave the
    account state.
  - `kortix_browser` (Platinum Browsers): `connect` (short-lived CDP URL for
    `agent-browser --cdp`), `status`, `save_login` (saved profile), `pause`,
    `reset`. One browser per account, shared by every session.
  - `kortix_phone` (Twilio): `get_number` (buys on first call),
    `list_messages`, `wait_for_code`, `send_sms`, `release_number`. Incoming
    texts are polled from the provider's message log, so no webhook route.
    Offered only when `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set.
- **2026-11-27** An account's credential IS its state, encrypted with the
  workspace key (`kortix-agent/state.ts`). Kortix mints it at install and on
  first use. A state write lands only on a live account: a revoke wins.
- **Open** Twilio over Telnyx because polling needs no route. D3 still needs
  the paying account. Some sites refuse VoIP numbers for codes; US sending
  needs A2P 10DLC.
- **Open** Agent-owned accounts are unreachable in the gateway
  (`connectionIsReachable`); until then a Humanoid's accounts are project
  accounts narrowed to its agent by grants.
- **Open** Removing an account does not yet delete its Platinum browser,
  saved profile or phone number.

## Decided: Kortix Browser through the gateway (2026-11-27)

- **2026-11-27 (Marko)** Every capability a Humanoid uses is a connector, so
  one gateway enforces rules, approvals and the call log for all of them.
  Kortix Browser is the priority.
- **2026-11-27** Every page action runs in the API over CDP
  (`kortix-agent/browser-page.ts`): `open`, `snapshot` (refs), `click`,
  `type`, `press`, `read`, `screenshot`, tabs, `evaluate`. The CDP URL stays
  on the server. `connect` (raw CDP for agent-browser) remains the one bypass,
  and the history records each URL handed out.
- **2026-11-27** The account state keeps `sites` (per origin: username, a
  password never returned, notes, signed-in and saved times) and `history`
  (the last 200 pages and actions). `fill_login` types a stored password
  from the server into the page. State changes are atomic under the
  connection row lock (`updateAccountState`).
- **2026-11-27** A result with `data_base64` + `mime_type` is a file:
  `kortix connectors call` writes it to disk and prints the path.
- **Open** Web search, scrape and image search already bill through the router
  proxy; moving them to a connector changes billing attribution and the web
  UI's tool cards. Needs Marko's call.

## Decided: every base capability is a connector (2026-11-27)

- **2026-11-27 (Marko)** The base connectors (phone number, authenticator,
  Toolbox, browser) are finished first, so an action space can be assembled
  like a person's. Built-in tools are glued to connectors underneath.
- **2026-11-27 (Marko)** A captcha solver is a default of the managed browser,
  not an optional extra.
- **2026-11-27 (Marko)** Compute stays as it is (one sandbox per session).
  Sandboxes as a connector is a future intent: `../compute-as-connector/`.
- **2026-11-27 (Marko)** Kortix-managed connectors are our own build, modeled
  on treg; no treg code is copied. Hosted treg.to is the bridge for now.

## Decided: the Humanoid is My Kortix at full strength (2026-11-27)

- **2026-11-27 (Marko)** First the action space, then the harness and the
  experience. The Humanoid approaches every role like a forward deployed
  engineer: it builds software, agents, triggers, unified data and
  connections, over long horizons.
- **2026-11-27 (Marko)** One infinite write-ahead event log is its
  notification centre; every message from a person or a system lands there
  and is dispatched to a session or routed to the one linked to it. One place
  configures all event sources and the procedures they start. Design:
  `event-ledger.md`.
- **Open** Adopt the Vercel Board method (topics, tasks with claim and lease,
  dependencies) as the work layer above the ledger.

## Proposed: the knowledge contract (2026-11-27)

- **2026-11-27 (Marko)** Procedural memory is skills. Episodic memory is the
  event ledger, read-only, written by the system and by agents, rebuilt as a
  tree. Semantic memory is an ever-maintained markdown wiki. Design:
  `memory.md`.
- **Open** The wiki lives in Files (volume versions), not git. `kortix_memory`
  becomes its `people/` part.
- **Open** No up-front ontology: wiki pages, ledger links and connector
  actions are the ontology, built as the Humanoid works.

## Decided: framing, data and telephony (2026-11-27)

- **2026-11-27 (Marko)** The comparison with Palantir, Databricks, Celonis and
  RPA is about Kortix CompanyOS as a whole; the Humanoid is its core.
- **2026-11-27 (Marko)** Kortix unifies every data source (read) and every
  connector (write, full CRUD) and every event in one place, with no second
  copy of the data: retrieval happens at run time (the Databricks catalog
  method, not Palantir's object store). The ledger keeps events, the wiki
  keeps compiled knowledge with sources; source data stays where it lives.
- **Open** A long-term ontology: object types defined as how to fetch them
  from each connector, plus an identity map (one id per real-world object
  across sources). No copied rows.
- **2026-11-27 (Marko)** Kortix pays for Twilio (managed numbers). A workspace
  can also bring its own provider, as email allows its own sending domain.
