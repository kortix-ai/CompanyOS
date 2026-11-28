---
recorded: 2026-11-28T15:38:43Z
incident_date: 2026-11-27
---
# Never keep held session-log messages that a newest page does not reach, and drop an optimistic send once the log holds it

**Rule:** In `applySessionLogPage` (`packages/sdk/src/core/session-log/store.ts`), a newest page (`has_more`, no `beforeSeq`) whose first real `seq` is above every held real message leaves a hole nothing reads: older pages are read only below the first held message. Drop the held messages below it, with their revs, and offer older pages again. In the sync store, remove this tab's optimistic stub when the log first holds its id or its re-minted echo id. A stub hidden only while the log holds the id comes back, untimed so at the bottom, as soon as a rebuilt log lacks it.

**Trigger surface:** The device saved copy (`saved-copy-store`), the re-open path of `startSessionLogSync`, reads after a reconnect or a background tab, the overlay `sessionLogThreadWithV1Rows`, `beginOptimisticSend` / `optimisticAdd`, and the page limit (`SESSION_LOG_FIRST_PAGE_LIMIT`, 40).

**Incident:** 2026-11-27 (prod v0.16.5), reported again by a team member and a customer as "replies vanish until a hard refresh" and "my past messages are sent to the bottom". The session open writes the saved copy (one stored page). A tab that stayed open while more than 40 messages arrived and then navigated away and back in-app applied that copy, then the newest page. The prod case lost seq 1274–1460, and 11 of the person's own idle sends from that range showed at the bottom with no replies. Reproduced on the local stack (send from the composer, 25 more turns, leave, come back).

**Enforcement:** `store.test.ts` ("a newest page that reaches no held message…", "a stream-put message below such a page…", "a queued prompt is no position…"), `use-session-log.test.ts` ("a re-open after more than a page of messages…"), `sync-store-session-log.test.ts` ("an optimistic send the session log held"). 7 of these fail on the unfixed code.
