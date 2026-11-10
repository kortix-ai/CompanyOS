Release v0.15.4 — Agents act with your rights, no repository checkout at boot, and stateless sandboxes by default

Agents act with your rights, no repository checkout at boot, and stateless sandboxes by default

### New
- Agents act with their person's rights. My Kortix uses every connector and secret you can use and posts or edits a Slack message itself, without starting other agents. Refusals name the missing permission and who grants it, instead of "agent sessions cannot". Starting a workspace-shared sign-in from a session works for anyone who may share accounts (#12240).
- The connector catalog lists apps; it no longer decides what may connect. Wispr Flow connects through its own server in one click, ahead of Composio. A server an agent adds that no catalog lists gets a one-time approval link that opens the address prefilled (#12240).
- Sessions start without a repository checkout; repository access comes from grants (#12136).
- Workspace agents clone their workspace from a session again (`kortix workspaces clone`), and committing from the host fetches the repository when the session has none (#12323, #12308, #12315).
- Stateless sandboxes are the default for new sessions (#12172).
- One-off credit top-ups are an Enterprise option; the out-of-credits dialog leads with the plan (#12130).
- The usage page shows spend as a chart, a heatmap and an activity feed (#12238).
- An agent's workspace declares the repositories it clones and its setup steps; they run in the background when a session starts (#12262).
- Behind the `voice_call` flag: an empty composer calls the agent (#12297).

### Improved
- My Kortix names which agent does the work on every hand-off; it never starts an unnamed helper by default (#12248).
- Agent prompts and skills say that /workspace starts empty and how to clone a repository (#12255).
- The audit log keeps 14 days in the database with the S3 archive on (#12243).
- The frontend for staging and production is built in CI; Vercel only hosts it (#12245).
- The release suite's slowest lane drops from about 21 to 11 minutes (#11588).
- The model catalog sync stops re-asking for secrets it was refused (#12256).
- The workspace diff builds its untracked-file patches in one git call (#12220).
- Internal cleanup: shared API primitives, App route gates, the platform-admin webhook pipeline and the IAM read models each have one implementation; dead UI code and source-text tests are gone (#12224, #12223, #12213, #12191, #12185, #12231, #12230, #12227, #12226, #12260). Two legacy database drops are parked and the database password stays out of the backup's arguments (#12261).

### Fixed
- The desktop app opens its workspaces again, and 404 pages render (#12253).
- Sessions moved to another workspace keep their git access, and paying accounts split too (#12285).
- A session an agent starts inherits the connectors its parent could reach (#12257).
- Folder uploads to Files show progress at once and recover from a busy server (#12317).
- Notification toasts show only inside the app, never on marketing pages (#12322).
- Chinese and Japanese plural strings for workspaces and storage render correctly (#12341).
- Sessions no longer fail on a catalog check no sandbox could pass (#12244).
- A failed session's prompt queue no longer floods the audit log and payload storage (#12241).
- The LLM gateway meters a retried request once (#12210) and keeps a truthful per-credential counter on unvalidated requests (#12212).
- Connector call failures report their own status instead of a generic 500 (#12221).
- The email sign-in link returns to the site that started it (#12232). The auth timeout error is built on the server only (#12236).
- The create-workspace dialog says why a name is rejected (#12228).
- The embed action moves out of the Session access dialog (#12247).
- The CLI ships to the seeded workspace remote correctly (#12229), and `whoami --json` bounds its account list (#12197).
- Billing: the transactions count is bounded and the audit reconciliation scan is paced (#12249).
- History recovery keeps a log whose todo status is unknown (#12235). The config-release tick is exempt from the 25 s request deadline (#12222).
- App scaling survives a database deadlock (#12195). Superseded gateway-log index builds are skipped (#12214).
- Fewer noisy logs: agent-grant denials, inbox transcript reads and the manifest tripwire are rate-limited or downgraded (#12234, #12252, #12211, #12338), and third-party tracking-pixel noise is dropped from error reports (#12225).

### Security
- Suna-era tables in the public and basejump schemas are frozen for writes and closed to anonymous and signed-in database API access ahead of their removal. Contact-form submissions move to the kortix schema (#12243).
- A crafted frame filename can no longer stall the browser-noise filter (#12266).
