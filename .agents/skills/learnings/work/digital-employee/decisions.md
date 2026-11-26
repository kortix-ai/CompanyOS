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
