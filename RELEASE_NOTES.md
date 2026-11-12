Provider keys work everywhere, Gmail connections finish, and Slack answers as your agent

Provider keys work everywhere, Gmail connections finish, and Slack answers as your agent

### New
- Kortix answers in Slack as the agent you picked, with its name and face, and always replies, even when a turn fails.
- Pick which ChatGPT or Claude subscription a turn runs on, right in the model picker.
- Install Kortix on your home screen as an app, with an offline shell.
- Agents set their own check-ins and goals instead of asking you to check back.

### Improved
- New API keys, ChatGPT accounts and Claude accounts are shared with everyone in the workspace by default when you may share workspace keys. You can still make one private.
- `kortix providers set` saves the key where Models → Providers lists it, with `--private` and `--label`.
- Testing a model shows the provider's own answer, such as "invalid x-api-key", and the request appears in Logs.
- When a key exists but is private to another member, the error says so instead of "not connected".
- Faster prompt handling, session-log reads and skill loading in large workspaces.
- All web components run on one UI foundation.

### Fixed
- A provider key added in Models → Providers works everywhere: the model test, `kortix gateway test`, gateway API keys, sessions started without a key selection, and automations. Before, these said "No API key is connected" with the key in the list.
- Gmail and other app connections that finished sign-in now work on first use, and the production webhook for app events receives its events.
- Automations that start on an app event activate when the account is shared with the automation's agent.
- An automation on a Claude subscription no longer fails with "No usable model"; when only private keys exist, it says how to fix it.
- A workspace link shows "Ask for access" to non-members again; admins can find a workspace by ID.
- MCP clients that sign in through the consent page work again.
- App machines: a start in progress answers 503, and exec gets its full time limit.
- Drive writes that the sandbox host refused are replayed.
- The background worker no longer crashes every ~90 minutes.
- Signed-in visitors never see the marketing landing; marketing pages scroll normally.
