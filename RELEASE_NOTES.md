More reliable triggers and clearer usage tracking

More reliable triggers and clearer usage tracking

### New
- Configuration commits now identify the caller who made the change (#12965).

### Improved
- Claude subscription usage is recorded, and subscription tokens receive usage valuations (#12956).
- Chrome extension testing instructions match the production sign-in labels (#12962).

### Fixed
- Trigger validation checks the agents referenced by trigger runs (#12967).

### Security
- No security-specific changes in this release.

### Internal
- Added replay coverage to keep slash commands and their arguments hidden (#12950).
- Core test lanes use Supabase images from the runner's warm template (#12963).
- Advanced the development version to 0.16.3 (8dd46e8).
