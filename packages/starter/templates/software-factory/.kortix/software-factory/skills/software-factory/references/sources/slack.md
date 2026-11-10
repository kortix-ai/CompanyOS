# Source: Slack (or another team chat)

Trigger `source-slack` (cron every 15 min, one keyed session). Disabled by
default. Setting: `sources.slack.channel` (the channel name, for example
`#bugs`). The same rules hold for Microsoft Teams or Discord through their
connector.

| | |
|---|---|
| Signal | new threads, and new replies on tracked threads, in one channel |
| Finding | one thread that reports a clear bug or asks for a clear change |
| Bar | **clear**: a bug names the surface, the action, the observed result and the expected result or an error; a request names the surface, what should change and the result wanted. Unclear: no ticket and no message; the next pass files it once a reply makes it clear. Chit-chat, thanks, questions without a defect, announcements: nothing |
| Key | `slack:<channel id, lowercase>:<thread ts>` |
| Signal value | `signal: thread_replies=<n> reporters=<n>` |
| Priority | 1 an outage or a blocked user; 2 a bug; 3 a feature; 4 polish |
| Kind | `bug`, `feature` or `task` |
| Credentials | the `slack` connector (read history, post and edit messages, add reactions); the store's credentials |
| Cap | never capped: a person reported it |

## Run

1. Resolve the channel id by name through the connector
   (`kortix connectors show slack` once, then `kortix connectors call slack …`).
   Not a member: end with `errors=not-in-channel`.
2. Read threads newer than the cursor (the newest `ts` this keyed session
   recorded, else the last 24 h), and every thread of an open `slack:*` ticket.
3. Classify each untracked thread (Bar). A thread that already names a ticket
   (a pasted link or identifier) links to that ticket: no second ticket.
4. Semantic lookup against every open factory ticket (contract §5): the same
   defect is a link (`[factory-source] update · linked thread <permalink>`),
   never a new ticket.
5. Upsert one ticket per clear thread: paraphrase the report, never copy the
   message text or a person's name; `## Source` holds the thread permalink.
   State `triage`; the factory accepts it in intake.
6. **One status message per thread.** Post one reply `Tracked in <ticket link> ·
   <state>` the first time; every later state change edits that same message
   (`chat.update`). Find it by reading the thread for the bot's own message
   first. Never post a second one, never ask a question, never answer one.
   React `eyes` on the root when filed, `white_check_mark` when done.
7. New human replies on a tracked thread: one `[factory-source] update ·
   thread replies=<n>` comment with at most 3 paraphrased bullets. A reply
   `build it` (or the team's word) after a block or hand-back: post
   `[factory-intake] retry · accepted in the thread`.
8. Record the cursor in the run line (`cursor=<ts>`), so the keyed session
   finds it next pass.
9. End with `source-slack:`, the contract run line, `threads=<n> unclear=<n>
   cards=<n> card_edits=<n>`.

Never call the interactive question tool here: a blocked turn stops every later
pass of this keyed session.
