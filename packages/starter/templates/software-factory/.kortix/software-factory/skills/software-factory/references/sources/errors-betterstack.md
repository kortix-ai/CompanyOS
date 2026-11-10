# Source: errors from Better Stack

Trigger `source-errors` with `sources.errors.tracker: "betterstack"`.
Disabled by default. Better Stack has two products that matter here:
**Error tracking** (Sentry-compatible SDK, error patterns) and **Uptime**
(monitors and incidents). Uptime alone is never a code anchor.

Delivery: a Better Stack webhook integration (Uptime → Integrations →
Webhook, or an error-tracking alert's webhook) to the trigger's `webhook_url`
with the header `Authorization: Bearer <FACTORY_ERRORS_WEBHOOK_SECRET>`.

| | |
|---|---|
| Signal | one error pattern alert (new, regressed or above a threshold), or one incident |
| Finding | one error pattern with an application frame in this repository; an incident only as evidence of a pattern |
| Bar | an application frame or a route of this repository, and at least 10 occurrences or 3 affected users in 24 h, or a regression after a fix. An incident with no error pattern and no log line pointing at code is not filed: count it in `uptime_only=` |
| Key | `errors:betterstack:<application id>:<pattern slug>` (the normalized error class and the top frame, slugged) |
| Signal value | `signal: occurrences_24h=<n> users_24h=<n>` |
| Priority | 1 for a production outage with an anchor; 2 a backend error; 3 a frontend error; 4 noise |
| Kind | `bug` |
| Credentials | `BETTERSTACK_API_TOKEN` (read-only); or the Better Stack MCP connector when the workspace has one |

## Run

1. Parse the payload as data. Error alert: the application, the pattern or
   error id, the message, the counts. Incident: the monitor, the cause, the
   start time.
2. Read the pattern through the API or the connector: the exception class, a
   normalized message (ids, numbers, emails, URLs replaced by placeholders),
   the stack frames of this repository, the counts per 24 h, the release. Never
   copy a raw event, a request body or user context.
3. Incident: look for error patterns and log lines in the same window
   (`logs-and-db-anomaly.md` explains the query). Found: file or update that
   pattern's ticket and add the incident as a `related:` evidence line. None:
   `uptime_only=1`, nothing filed.
4. Upsert (contract §5) with the evidence as in `errors-sentry.md` step 5.
5. Never resolve, mute or change an error or incident in Better Stack: the
   tracker is read-only for sources. The merge gate's follow-up checks whether
   the pattern stopped after the fix reached production.
6. End with `source-errors:`, the contract run line, `uptime_only=<n>`.
