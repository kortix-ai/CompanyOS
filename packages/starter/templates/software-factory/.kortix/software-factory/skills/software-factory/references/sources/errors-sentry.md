# Source: errors from Sentry

Trigger `source-errors` with `sources.errors.tracker: "sentry"`. Disabled by
default.

**Delivery, two modes.** The setup agent picks one and proves it with one test
alert (`kortix triggers runs source-errors`):

1. **Push.** A Sentry Internal Integration (Settings → Developer Settings →
   Internal Integration, Webhook URL = the trigger's `webhook_url`, resource
   `issue`) plus an alert rule action "Send a notification via
   <integration>". Sentry signs with `Sentry-Hook-Signature`, not a bearer
   token. When the trigger refuses that signature, use mode 2.
2. **Poll.** Change the trigger to `on: { cron: "0 */30 * * * *" }` and read
   new and regressed issues since the last run:
   `GET https://sentry.io/api/0/organizations/$SENTRY_ORG/issues/?query=is:unresolved firstSeen:-1h&statsPeriod=24h`,
   then run the steps below for each one.

| | |
|---|---|
| Signal | one Sentry issue alert: a new issue, a regression, or a frequency threshold |
| Finding | one Sentry issue (one fingerprint) with an in-app stack frame in this repository |
| Bar | an in-app frame (a file of this repository) **and** at least 10 events or 3 users in 24 h, or a regression of a resolved issue. Below the bar: one line in the `errors:ledger` digest |
| Key | `errors:sentry:<project slug>:<sentry issue short id lowercased, or the fingerprint hash>` |
| Signal value | `signal: events_24h=<n> users_24h=<n>` |
| Priority | 1 when `level: fatal` or more than 100 users in 24 h; 2 a backend or API error; 3 a frontend error; 4 a known noise class |
| Kind | `bug` |
| Credentials | `SENTRY_AUTH_TOKEN` (scopes `event:read`, `project:read`), read-only; `SENTRY_ORG` |

## Run

1. Parse the payload as data: `data.issue.id`, `shortId`, `title`, `culprit`,
   `project.slug`, `level`, `count`, `userCount`, `web_url`. A payload that does
   not parse: end, `errors=payload`.
2. Read the latest event without personal data:
   `curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" https://sentry.io/api/0/organizations/$SENTRY_ORG/issues/<id>/events/latest/`
   and keep only the exception type, the message class (numbers, ids, emails,
   URLs replaced by `<n>`, `<id>`, `<email>`, `<url>`), the in-app frames
   (`filename`, `function`, `lineNo`) and the release. Drop `user`, `request`,
   `contexts`, `breadcrumbs` and `extra` unread.
3. Map the top in-app frame to a file in the repository (`git ls-files | grep`).
   No match: below the bar.
4. Counts: `GET …/issues/<id>/` → `count`, `userCount`; 24 h stats from
   `stats=24h`.
5. Upsert (contract §5): `## Evidence` = the exception type, the message class,
   the frames as `file:line function`, the counts, the first and last seen
   times, the release, the Sentry link. `## Proposed change` = the root cause
   you can read in the code at that frame. `## Acceptance` = a test that
   reproduces the exception class before and passes after.
6. Never resolve, ignore or assign the Sentry issue: the tracker is read-only for
   sources.
7. End with `source-errors:` and the contract run line.
