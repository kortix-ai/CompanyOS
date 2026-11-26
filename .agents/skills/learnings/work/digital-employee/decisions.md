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
