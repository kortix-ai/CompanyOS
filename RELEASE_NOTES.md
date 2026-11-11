Subscription usage per account, Artifacts on mobile, and a side-by-side Review inbox

### New
- ChatGPT and Claude subscription usage lives in the OpenAI and Anthropic provider sheets: every connected account, every usage window the provider reports, and when the next login is back. The separate Usage tab is gone (#12405).
- The mobile app lists, opens and shares a project's Artifacts (#12406).
- Mobile app 1.6.1 on iOS: native system sheets, a ChatGPT-style project drawer, and a full-screen GenUI map (#12407).
- The workspace Inbox's Review tab opens an item beside the list. j/k move through the list, and the next item opens after a verdict (#12410).

### Improved
- The workspace menu is flat and shorter. Download app moves to the foot of the sidebar (#12408).
- A new session shows the model it was launched with from the first moment, also while it is still starting (KRTX-4724) (#12425).
- Settings > Usage > Session costs shows spend that matched no session as its own row, so the table and the summary add up (KRTX-4428) (#12018).
- The Free pricing card says that sending needs your own key, or a paid plan for managed models (KRTX-4494) (#12072).
- The Logged in as menus and the sidebar identity line show your profile picture (KRTX-4492) (#12074).
- The credit ledger's five missing badge labels are translated in every language (KRTX-4655) (#12351).
- The mobile Sessions page lists the sessions a person started by default (KRTX-4705) (#12390).
- `kortix projects ls` and `kortix workspaces ls` leave out deleted workspaces (KRTX-4714) (#12402).
- My Kortix: 12 fixes from an end-to-end audit, and a session's CLI reports the release version instead of a staging build stamp (#12413).
- Website: the banking case study is hidden, and asset management has short copy and moves last (#12422).

### Fixed
- A Kortix App that acts as its viewer works in a workspace that requires MFA, once the viewer passed the second factor (#12423).
- Opening a further workspace no longer shows the Out-of-credits modal while your free credits are unspent in another workspace (KRTX-4713) (#12418).
- Asking twice to join the waitlist with the same address keeps one request (KRTX-4699) (#12382).
- A wrong HTTP method on an existing API route answers `405` with an `Allow` header instead of `404` (KRTX-4704) (#12383).
- An OAuth2 provider that refuses client registration gives a clear `400` instead of a server error (KRTX-4709) (#12396).
- The sign-in email check answers the same for existing and new addresses (KRTX-3504) (#11720).
- When Composio's edge blocks a connector call, the agent gets the block as a client error and stops retrying the same call (KRTX-4722) (#12417).
- kortix.com uses posthog-js 1.447.12, which sanitizes survey HTML (#12426).
- Every API and gateway response carries a referrer policy (KRTX-4702) (#12381).

### Internal
- Sub-agents and the MCP `read_session` tool read the stored session log. The old v1 transcript route answers with a `Deprecation` header (#12431).
- Workspace rows are updated in place, never re-created, and workspace lookups go through one function (#12427, #12428).
- Load limits: one session's stored log can be read 300 times per minute (KRTX-4696) (#12379), and the config poll's probe has one bounded budget (KRTX-629) (#12412).
- Log noise: credential-fence refusals throttle (KRTX-4731) (#12429), the reaper counts Platinum guest-exec timeouts and 504 renewals as transient (KRTX-4718) (#12411), and image reclaim skips a provider that cannot list (KRTX-4694) (#12376).
- Secrets: retired provider keys are removed, and the prod internal service key and the Tavily, Serper and Firecrawl keys are rotated (#12433, #12430).
- Code cleanup with no behavior change in web, SDK, API and the model catalog (#12416, #12380, #12375, #12357, #12404, #12264, #12370, #12364, #12251, #12393, #12403, #11717, #11716, #11083, #11069, #12415, #12414, #12239).
- CI, infra and docs: the dev deploy typechecks before any ECS roll (KRTX-4672) (#12374), stale web hosts leave the kortix.com zone (KRTX-3365) (#12387), the parked legacy table drop records the verified prod backup (#12420), the Tests lane's stale assertions are fixed (#12359, #12397), and two learnings entries (#12401, #12434).
