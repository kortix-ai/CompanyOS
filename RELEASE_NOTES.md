Bigger plans, shared drives, and a My Kortix that asks first

### New

- Bigger plans. The Credits ladder goes higher, and bigger tiers include up to 30% bonus credits.
- New drives are created on shared volumes. Existing drives keep their storage.
- The Session usage view lists the skills a session used and the share of context each one took.
- Changelog week pages show feature announcements.
- A help menu in the workspace sidebar footer.
- Sessions opened from an App access link are marked as such.

### Improved

- My Kortix asks before it sets up unattended work. It names the access a sign-in grants before you say yes, and it treats the answer to a detail question as an answer, not as the yes.
- Schedules and automations that My Kortix creates start paused. They go live only after their test run succeeds, and a paused schedule reads as paused.
- My Kortix relays each colleague's report with its findings, reads the credits left, and says only what it checked. Agents it creates are declared subagents.
- Replies recover after a reconnect race. Sessions recover from provider failures and clear stale errors.
- Web search and page fetch fall back to a second provider when the first one refuses.
- Claude Code moves on to the next Claude account when Anthropic refuses one.
- Connector setup is optional and can be skipped. A category search lists its popular apps first, and signed-in connector cards stay in the chat.
- One global border, a smoother shadow ladder and tuned font weights across the web app.

### Fixed

- Signup confirmation links work after 5 minutes.
- An email inbox bound to an agent with no connectors starts its session again. An inbox email that cannot start a session keeps the reason.
- Deleted sessions stay out of normal session lists.
- The plan re-syncs when you return from the billing portal. Each person gets one subprocessor notice.
- The reset-password form submits safely. A sign-in mail outage gets a clear error, and the sign-in page says why it asks you to sign in again.
- An edit to a secret's approved hosts saves without a new secret value.
- Recent Sessions in the command palette shows session titles.
- Trackpad back and forward navigation works again. Inbox returns to the page you came from.
- Active child sessions collapse.
- Links in an App open outside the App frame.
- App preview waits its short grace period after a reload. Audio outputs are labeled Audio. Provider tooltips show at once. An unsaved folder-access draft survives a refresh.
- Every session lists its skills in the same order.
- Mobile: a new session shows its first message once. iOS builds use the iOS 27 SDK.
- `kortix agents ls` no longer suggests a model pin that no model can satisfy.
- Creating a managed repository retries a transient failure.

Internal: contract-test repairs, faster worktrees, SDK and gateway refactors, release tooling.
