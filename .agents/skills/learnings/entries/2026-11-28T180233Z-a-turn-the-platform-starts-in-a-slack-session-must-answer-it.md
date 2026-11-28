---
recorded: 2026-11-28T18:02:33Z
incident_date: 2026-11-28
---
# A turn the platform starts in a Slack session must answer its thread

**Rule:** When a Slack-started session runs a turn no Slack message opened (a subagent's report, another session's message, a sign-in completion, an auto-recovery), its reply goes to the session's Slack thread. A turn end with no `chat_turn_streams` row is not a turn to drop.

**Trigger surface:** Changing `apps/api/src/channels/slack/turn.ts` `relayTurnEnd` or `postAnswerWithoutTurnDetailed`, the turn-end relay in `projects/routes/turn-stream-handlers.ts`, or a new `system:*` lifecycle source that starts a turn for a chat thread.

**Incident:** 2026-11-28, prod. A Slack session handed a fix to a colleague, answered once, then relayed four reports that reached only the session page. The thread stayed silent for 26 minutes and looked stopped. Across 7 prod Slack sessions, 21 of 171 report turns reached Slack. Fixed in #13261.

**Enforcement:** `apps/api/src/__tests__/integration-slack-follow-up-turn-reply.test.ts` (db-suites): a report turn posts once; web-prompted, retryable, stopped and moved-thread turns stay quiet; a `slack send` turn does not post twice.
