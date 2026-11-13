# Empty states

Every empty, failed or finished view uses one primitive and one family of
pictures (D49). Live catalogue: `/design-system#empty-state`. Source:
`packages/ui/src/primitives/empty-art.tsx` (`EmptyArt`, `EMPTY_ART_KINDS`),
`empty-state.tsx` (`EmptyState`), `error-state.tsx` (`ErrorState`).

## Pick the picture by situation

| Situation | Code |
|---|---|
| A search or a filter matched nothing | `<EmptyState art="search" … />` |
| A load or a request failed | `<ErrorState … />` (draws `error`) |
| The viewer has no permission | `art="locked"` |
| No network, or the sandbox is unreachable | `art="offline"` |
| A list the user cleared: everything is finished or read | `art="done"` (no action) |
| No sessions, threads or messages | `art="chat"` |
| No agents | `art="agent"` |
| No connector, integration or channel set up | `art="connect"` |
| An empty folder in a drive | `art="folder"` |
| No documents or notes (the default without `icon`) | `art="document"` |
| No produced items: artifacts, runs, history | `art="list"` |
| No images or media | `art="image"` |
| No API keys, tokens or secrets | `art="key"` |
| Any other empty list | `icon={NounIcon}` (the `fan`; the icon stays muted) |

A kind beats an icon: reach for `icon` only when no row above names the
situation. Never draw a new illustration, an icon tile or a hero image for an
empty view; add a kind to `EmptyArt` instead (and to the catalogue on
/design-system and this table).

## The words

- **Title:** what is true, in 2 to 4 words. "No results", "You're offline",
  "All done". Not "Oops!", not a question.
- **Description:** one sentence, one line (about 45 characters at 13px in the
  320px column). Say what fills this place or how to recover. No period-less
  fragments, no second sentence.
- Name the scope when it helps: "Nothing matches “quarterly”."

## The actions

- At most two. Most empty views have one; `done` and read-only lists have none.
- **Create the first item:** primary `Button` (default variant, md):
  `action={<Button>New session</Button>}`.
- **Recover** (no results, failed, offline): `Button variant="secondary"`:
  Clear search, Try again, Retry. The user did nothing wrong, so it is not
  primary.
- **No access:** secondary "Request access" when a request flow exists,
  otherwise no action.

## Size and placement

- Default: a 100 × 56 picture over a 320px text column, centred in the
  space the list would fill. The picture stays small so the empty view
  never pushes the page's own content out of sight.
- `size="sm"`: a 240px text column, for a panel, a column, a popover or a
  sidebar.
- A one-line empty row inside a menu or a palette is not an `EmptyState`:
  use the component's own empty slot (`CommandEmpty`, `PaletteEmpty`).

## Don'ts

- No `media` with a custom drawing, no forked `EmptyArt`, no colored icon
  except `error` (red) and `done` (green).
- No skeleton rows behind an empty state; loading is `Skeleton`, empty is
  `EmptyState`, never both.
- No marketing copy or emoji in an empty state.
