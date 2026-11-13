Connect ChatGPT and Claude from the composer, one Slack workspace per Kortix, and a wide batch of mobile and web fixes

### New
- Connect ChatGPT and Claude right above the first-chat composer (#12559).
- A Slack workspace now runs in one Kortix workspace; agents move between workspaces by their own rules (#12499).
- Provider keys need no feature flag; "Pooled Provider Secrets" moves out of Feature flags (#12561).
- Agent reports fold into a single row over the answers on web and mobile (#12566).
- status.kortix.com now shows the worker through a Better Stack heartbeat (#12591).
- Mobile dev builds upload to TestFlight on a version change (#12562).

### Improved
- The project gate reads the canonical Workspace record, and the resolver owns the deleting view (#12540).
- Mobile settings drop their dead surfaces and the prompt tile collapses (#12544).
- Session-cost records are served from @kortix/sdk (#12539).
- Mobile reuses one paged gallery, one bundled-asset text reader, one debounce hook, and unified pixel/config/upload helpers (#12532, #12550).
- The connector invalidation helper moves to the hooks layer, and the credential move ledger records why a transfer leaves it (#12531).
- Session-row rules live in one place for both hosts (#12525).
- CLI: the tokens command splits by resource, the Dockerfile lint splits into named checks, and the sessions help checks share splitHelp (#12587, #12600, #12593).
- One migration-ledger module with one sha256 and one safety header (#12606); the registry reuses the manifest-schema issue model (#12608); the TUI shares one action hook, time ladder and clip (#12603).

### Fixed
- Web sign-in on a phone no longer opens the app (#12543).
- /auth no longer logs "Encountered a script tag" on load (#12565).
- The demo booking calendar loads again and the CSP report noise stops (#12568).
- More options shows progress and keeps the suggested workspace name (#12570).
- Upgrade opens on $50 and Confirm rows name their question (#12574).
- The CLI authorize page offers a retry when the workspace list fails to load (#12573).
- Rapid follow-up input is kept when starting a session (#12586).
- Notifications move to the person-level Inbox (#12582); pending questions list and settings gates are preserved (#12595).
- Sent prompts no longer vanish from a session (#12602).
- Agent · Model tabs show on iOS and in the iOS model sheet; the Android workspace switcher header and search lay out correctly (#12548, #12560, #12601).
- Mobile: a null search text reads as empty (#12546); drawer pages open at once instead of after 2–3 s (#12558); drawer sections show only with rows and Show more always loads one (#12577); iOS content sheets open at content height as Liquid Glass (#12585).
- A dialog opened inside another dialog dims the parent again (#12556); no busy row shows under the answer while it streams (#12547); chat links to the app open in place with no page reload (#12581).
- Returning to a streaming session shows the whole answer so far (#12588); reload snapshots are retained and disconnected runtimes are explained (#12594); a live answer no longer freezes on Thinking when the stream joins mid-reply (#12596).
- Admins of an MFA workspace get repository access again (#12551).
- A git push of kortix.yaml applies its triggers and policies at once (#12563).
- No false "queued" reply in chat; failed box recoveries cap at 3 (#12567).
- The audit archive resumes after a worker restart instead of starting over (#12571).
- The workspace-invariants run survives a timeout and scans by index (#12578).
- API stops dialling a box proved dial-dead at the proxy (#12479) and surfaces a dead Daytona key instead of "provider state is unknown" (#12549).
- A failed deploy's cleanup no longer fails on its restore step (#12599); a leader tick names its timer and SQLSTATE on failure (#12590).
- Persistent provider auth outages page with the right provider's remediation (#12557).
- Noisy warn lines are throttled: the preview-sandbox 403 storm (#12529), person role-denial lines (#12583), and agent-access denial lines (#12592).
- The gateway remembers a refused model's typed refusal (#12470).
- An account-state event-trigger refusal answers 402, not 500 (#12524).
- The composer offers a model right after a plan checkout (#12575); one subprocessor notice email per person (#12605).
- Drive refreshes folder listings after failed reads (#12580).
- A Composio app gets no empty shared account, and revoke turns it off at Composio (#12584).
- Account-wide PATs are minted at /settings/tokens, and fence errors name the binding workspace (#12564).
- Plain CLI prompts settle on end of input instead of hanging (#12598).
- No sparse row list after a mid-result statement error (#12604).

### Security
- hono 4.13.17 and @hono/node-server 2.1.6 in the sandbox daemon and scanner lockfiles, closing six moderate advisories (#12621).

### Internal
- Dropped the Suna-era schemas, 224.7 GB of the prod database (#12569), and the unused pgjwt extension that blocks Postgres 17 (#12589).
- The v0.15.9 contract lanes match the merged behavior (#12533).
- Learnings: check CSP reports after enforcing a script allowlist (#12572).
- Test pins: the palette pick on a debounced group (#12545), the trigger-runs spend read index-only (#12553), and the streaming busy-row gate (#12555).
- Mobile store version bumps (#12552); dev VERSION targets 0.15.10.
