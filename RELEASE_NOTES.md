Release v0.15.3 — Workspaces, one settings panel, and API keys that act as an agent or a bot

Workspaces, one settings panel, and API keys that act as an agent or a bot


### New

- **Workspaces.** One workspace is one company: its people, agents, sessions, connectors, files and billing. It replaces "project" and "account" in the web app, the desktop app, mobile, the CLI, the TUI and the docs, in 9 languages. Sign-up lands on "Create a workspace" or an invite, and the switcher lists workspaces. Old routes, SDK names, `kortix projects`, `--project` and existing URLs keep working.
- **One settings panel.** Workspace settings holds everything an admin changes: the workspace, Library (models, connectors, secrets, skills, drives, triggers, sandbox, Git, repository), People, Billing and Advanced, with deep search. Customize now opens Workspace settings.
- **API keys act as you, an agent or a bot.** One API keys list replaces API keys and service account tokens. A key has read, full or custom access, expires after 90 days by default, and stops working when its creator leaves (a key for an agent or a bot keeps working). The CLI has `kortix keys`.
- **Review moves into the Inbox** as its own tab.
- **One model picker** with favorites, provider tabs and thinking levels. Connect ChatGPT and Connect Claude sit on the workspace home.
- **Getting started:** a workspace with no runnable agent shows a one-click setup prompt instead of an empty chat.

### Improved

- The upgrade dialog shows the same plans as the pricing page, and no longer scrolls sideways at high credit tiers.
- Drive conflicts open in a small popover.
- Session logs and Models › Logs load faster on large workspaces.
- `kortix logout` revokes the login token.
- Kortix Cloud no longer offers account branding. Self-hosted installs keep it.

### Fixed

- A tool call clicked in the chat no longer opens an empty side panel.
- A subagent runs as its parent agent, never as a guessed one.
- A failed Stripe check no longer moves a paid workspace to the free plan.
- A Platinum box whose daemon stops is restarted on the next request.
- Connector calls, webhooks, Slack messages, sandbox templates and public shares refuse more malformed or out-of-scope requests.
- Many quieter error reports, and fewer false alerts.

---
