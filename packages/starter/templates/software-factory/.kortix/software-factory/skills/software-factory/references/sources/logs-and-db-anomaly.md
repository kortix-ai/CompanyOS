# Source: logs and database anomalies

Trigger `source-logs-anomaly` (cron, hourly at :20). Disabled by default.
Setting: `sources.logs-anomaly.backends`, a list of backends with their
credentials' secret names, and `baseline_days` (default 7). Read-only, always.

| | |
|---|---|
| Signal | the last hour of application logs and database statistics, against the same hour over the baseline |
| Finding | a new error log pattern, an error pattern that spiked, a route whose 5xx rate or latency rose, a slow or newly slow query, a database error class, a missing-index advisory |
| Bar | a code anchor (a normalized message you can `grep` in the repository, a route handler, a query you can find in the code or the migrations) **and** impact: at least 3x the baseline and at least 20 occurrences in the hour, or a p95 latency at least 2x the baseline and above 500 ms, or a query whose total time is in the top 10 and grew at least 50 %. No anchor: one line in the `logs:ledger` digest |
| Key | `logs:<backend>:<sha1-12 of normalized message + route>` · `db:<backend>:<slowq\|log\|advisor>:<sha1-12 of normalized statement or lint + table>` |
| Signal value | `signal: count_1h=<n> baseline_1h=<n>` · `signal: p95_ms=<n> baseline_p95_ms=<n>` · `signal: total_ms=<n> calls=<n> mean_ms=<n>` |
| Priority | 1 an error class that blocks users (5xx on sign-in, payment, writes); 2 other 5xx or error spikes; 3 latency and slow queries; 4 advisories |
| Kind | `bug` (errors), `task` (performance) |
| Credentials | only read-only roles; never a production write credential |

## Normalize first

Replace in every message and statement: numbers → `<n>`, UUIDs and hex ids →
`<id>`, emails → `<email>`, IPs → `<ip>`, URLs → `<url>`, quoted strings →
`<s>`, SQL literals → `$<n>`. The normalized text is the fingerprint. Never
keep the raw line.

## Backends

| Backend | Read with | Example query (last hour vs. baseline) |
|---|---|---|
| PostgreSQL (any host) | `psql "$FACTORY_DB_READONLY_URL"` with a read-only role | `select queryid, calls, total_exec_time, mean_exec_time, left(query, 300) from pg_stat_statements order by total_exec_time desc limit 50;` (needs the extension; keep the previous snapshot in the `logs:ledger` body to compute the delta) |
| Supabase | the Management API with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` | `GET https://api.supabase.com/v1/projects/$REF/advisors/performance`; `…/advisors/security`; Postgres logs through `GET …/analytics/endpoints/logs.all?sql=<query>` with `select timestamp, event_message from postgres_logs where timestamp > now() - interval '1 hour'` |
| ClickHouse (or Better Stack Telemetry, which is ClickHouse) | `curl -s "$CLICKHOUSE_URL" --data-binary @q.sql` with a read-only user through a curl config on stdin | `select route, countIf(status >= 500) as e5xx, quantile(0.95)(duration_ms) as p95 from logs where ts > now() - interval 1 hour group by route order by e5xx desc limit 50` and the same over `ts between now() - interval 7 day and now() - interval 6 day + interval 1 hour` per day for the baseline |
| Datadog / Grafana Loki / CloudWatch / Elastic | their query API with a read-only key | the same two windows: errors grouped by normalized message and route, latency by route |
| Application log files in the sandbox | the `dev-environment` skill | not a production signal; never a source |

Every query reads aggregates. Never select user columns, request bodies or
payload fields.

## Run

1. Read factory.json. For each backend, run the current-hour and the baseline
   queries into files under `/tmp/factory/logs/`. A backend that fails: name it
   in `errors=`, continue with the others.
2. Normalize, group by fingerprint, compute the ratios in code (`jq` or `bun`),
   and keep the rows above the bar.
3. Anchor each row: `git grep -n` the message class or the route in the
   repository at the trunk; for a query, `git grep` its table and the
   distinctive clause. No anchor: digest line.
4. Cluster rows with one cause (an error pattern and the 5xx rise on its route;
   a slow query and the latency rise of the route that runs it) into one
   finding; the strongest row decides the key.
5. Upsert (contract §5, cap 5 per day): `## Evidence` holds the normalized
   fingerprint, the counts and the baseline, the time window, the anchor
   `file:line`. `## Proposed change`: the root cause you read at the anchor
   (a missing index is an index migration that follows the repository's
   migration rules; a slow query is a rewrite or an index; an error is a code
   fix). `## Acceptance`: a test or a query plan (`EXPLAIN`) that shows the fix
   on synthetic data.
6. One `[factory-source] update · digest` comment on `logs:ledger` with the
   rows below the bar; rewrite its body with the current snapshot (the
   `pg_stat_statements` totals) so the next run computes a delta.
7. End with `source-logs-anomaly:`, the contract run line, `rows=<n>
   anchored=<n> clusters=<n>`.
