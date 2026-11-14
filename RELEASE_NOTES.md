Program agents, goals that stay with each chat, and a smoother connector sign-in

### New
- Program agents: an agent can run your own code on every turn instead of a model, with a time limit and a payload input.
- Chats in My Kortix keep their own goals and check-ins until the work is done.
- A new workspace opens only after a model is connected, so the first chat always has a model to answer with.
- One-prompt developer onboarding, and new factory templates.

### Improved
- A finished connector sign-in lands on a Kortix page and tells the agent that it can continue. The sign-in card sits in the transcript under its step.
- The CLI authorize page fills in the login code and asks you to confirm it.
- The chat no longer jumps when you send a message or a queued prompt lands.
- The sidebar row shows Working and Ready as soon as a turn changes. Idle session tabs poll 3x less.
- Merge previews fetch only the head commit, not the whole repository mirror.
- The admin operations overview loads its last-24h usage from an index instead of a full scan.
- The CLI and the docs say `workspace_id` everywhere.

### Fixed
- A Stop no longer drops the first queued message of a session.
- The workspace home keeps a sent message in a locked composer until the session opens. Keys typed while the home loads reach the composer.
- Triggers: App targets, "every" periods and trigger links work in the web UI.
- The gateway replays an Idempotency-Key the same way on every replica.
- /connections never claims a connection by itself.
- One delete-account dialog for every account state.
- Teams manifest requests no longer return 409.
- Security updates for hono and @hono/node-server.
- Quieter logs: gateway refusals and Composio edge blocks no longer flood the warn level.
