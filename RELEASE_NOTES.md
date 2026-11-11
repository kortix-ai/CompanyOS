Release v0.15.5 — Steer a running turn, custom MCP servers without Composio, and steadier drives and capture

Steer a running turn, custom MCP servers without Composio, and steadier drives and capture

### New
- A message sent while the agent works steers the running turn, on every surface (#11690), including a message sent during a session's very first turn (#12369).
- Child sessions inherit the parent's model, parents steer their children, and scripts can hand work off to a session (#12368).
- Capture manages its own frame rate and settings; nobody can leave it slow or off (#12365).

### Improved
- Capture stays light on every computer, including slow ones (#12319).
- The drive file tree's folder listing stops re-reading storage on every poll (KRTX-4671) (#12349).
- A turn's end acknowledgment never waits on the box's runtime-state read, so turns end sooner (KRTX-4682) (#12350).

### Fixed
- A custom MCP server connects without Composio, and the wait names its phase (KRTX-4640) (#12347).
- My Kortix's project-secret leg closes again in repair mode (KRTX-4652) (#12307).
- A repair-mode fail-close reaches the boot-time secret path (KRTX-4675) (#12345).
- Strict-schema models can hand off to a named agent again, without the 160-call loop (#12366).

### Internal
- Log noise: the account-MFA step-up denial line throttles per route and window (KRTX-4674) (#12346), the preview access-refused line rate-limits (KRTX-4683) (#12353), the [preview] port give-up line throttles (KRTX-4695) (#12371), the Platinum drive failure lines rate-limit (KRTX-4672) (#12358), and the internal gateway's resolution-failure warning logs once per model and code per day (KRTX-4665) (#12326).
- Backoff under failure: the box's live log page backs off after repeated read failures (KRTX-4691) (#12362), drive sweeps back off while storage hangs and warn once per failing state (KRTX-4686) (#12363), and the reaper counts a Platinum transport timeout as transient instead of an error per box (KRTX-4687) (#12352).
- The merged-PR worktree cache is written aside and renamed into place (#12354).
- The API starts again on dev after a stale log-window import (#12367).
