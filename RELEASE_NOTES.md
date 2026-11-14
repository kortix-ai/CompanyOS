Software Factory leads the home screen, with faster usage reads and sturdier sandbox recovery

### New
- The home screen now leads with the Software Factory, and the prompt box is just the prompt with one copy button. (#12670)

### Improved
- Gateway usage now aggregates spend per session before the session join, so usage reads come back faster. (#12661)
- Sandbox health is served from the warm git mirror. (#12652)

### Fixed
- Parked sandbox removal now answers a retryable 503 and pages the outage when it hits a dead provider credential, instead of failing silently. (#12687)
- A git "not our ref" object-fetch refusal is now treated as a retryable git failure. (#12688)
- Get Kortix Usage no longer times out: a script's calls are drawn once. (#12683)
- Mobile session search and filters now reach the server. (#12691)

### Internal
- Release-suite fixes following up on v0.15.11. (#12675, #12679, #12681)
- The TRG-20 GitHub webhook test step defines its own sign helper. (#12684)
- The desktop-parity e2e helper is split and its ceremonies unified. (#12671)
- One owner each for grant membership, open-ask reads and the default agent. (#12673)
