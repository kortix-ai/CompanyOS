# Session results and review queue

Status: design direction approved; written specification awaiting review.

## Problem and job

The existing picker contains one current panel and nineteen alternatives.
Several alternatives emphasize statistics rather than reviewing deliverables.
The user rejected all nineteen alternatives.

Job: find a session result, inspect its content and changes, then continue the conversation.
Change: replace options 2–20 with nineteen review-oriented alternatives.
Keep option 1 as the comparison baseline.

The user selected: results first, review queue on the right, then preview.
The user declined browser mockups during brainstorming.

## Shared interaction contract

1. The initial right panel shows results before changes, context, or usage statistics.
2. Every result has a readable name, type, and working open action.
3. Select a result to show its preview in the existing docked detail surface.
4. The preview occupies the right region. Do not squeeze three columns beside chat.
5. Back restores the queue, selected row, filter, expansion, and scroll position.
6. Previous and Next follow the visible queue order. Disable them at the ends.
7. Changed-file rows open that file's diff. Do not send every row to a generic file list.
8. Changes remain reachable even when no output exists.
9. Context and usage remain secondary. They never displace results.
10. Browser, Files, Terminal, and existing plan content remain discoverable.
11. Queue membership means available for inspection. It does not imply approval or completion.
12. Never label an item reviewed merely because its preview opened.

## Nineteen alternatives

All alternatives implement the shared contract. Differences concern finding and reviewing results.
Names below describe comparison options, not new permanent navigation entries.

| Option | Alternative | Distinct review interaction |
| --- | --- | --- |
| 2 | Results list | One ordered results list; changes follow below it. |
| 3 | Sequential review | Select an item, then inspect siblings with persistent Previous/Next controls. |
| 4 | Preview navigator | Detail retains a compact result selector for switching without returning home. |
| 5 | By type | Expand document, image, app, and other groups independently. |
| 6 | Recent results | Order by verified source sequence; group earlier results separately. No invented timestamps. |
| 7 | Search results | Search names and paths; the preview navigation follows filtered results. |
| 8 | By folder | Expand path groups; pathless results remain in a named results group. |
| 9 | Visual results | Use existing safe thumbnails for visual outputs; unsupported thumbnails use file rows. |
| 10 | Featured result | Explicitly select a main result with all other results directly below. No inferred recommendation. |
| 11 | Results and changes | Two explicit views; results is the default and each view retains its position. |
| 12 | Changes alongside results | Show verified same-path changes beneath their result; unmatched changes remain separate. |
| 13 | Documents | Document-oriented queue with names and available format details; other types remain reachable. |
| 14 | Running apps | App results expose working preview actions before downloadable results. No inferred health claims. |
| 15 | File changes | Results lead; a folder-grouped changes section supports file-by-file diff review. |
| 16 | Expandable results | Expand one result's metadata and actions inline; content preview uses the full right region. |
| 17 | Compact queue | Dense readable rows prioritize scanning many results, with keyboard focus and full-name access. |
| 18 | Spacious queue | Larger rows prioritize recognizability and explicit Preview actions for a few mixed results. |
| 19 | Persistent selection | Keep an explicitly selected result prominent while new results append without stealing focus. |
| 20 | Filtered queue | Type filters compose with search; clear filters restores the complete queue. |

No alternative may substitute decorative bars, token meters, or cost summaries for the review workflow.
No alternative requires fabricated data, backend approval state, or new transport logic.

## Architecture and reuse

Extend `packages/ui/src/session/panel/overview/use-session-overview.ts` for shared presentation data only.
Continue reading runtime data through existing SDK hooks and SessionPanelProvider.
Do not add API calls in host code.

Use one shared result identity and queue model across all alternatives.
Deduplicate only when the existing source supplies a reliable identity or canonical path.
Preserve distinct outputs when identity is uncertain.

Compose focused queue, result-row, filter, and navigation components.
Variant definitions select grouping, ordering, density, and navigation behavior.
They must not duplicate nineteen preview implementations or runtime subscriptions.
Only the active alternative subscribes to live data and renders interactive controls.

Reuse EasyPanel's preview openers and existing detail/file/app viewers.
Reuse the current persistent terminal layer; never disconnect a terminal to change a queue layout.
Inspect existing plan ownership before changing the panel root. Preserve its only visible surface.
Keep queue state scoped to session and alternative; reset on a different session.
On removal of a selected item, show its unavailable state and allow returning to the queue.
New output must not interrupt a selected preview or change its sibling position unexpectedly.

## Layout and accessibility

Use existing Kortix tokens and primitives.
Use flat docked surfaces, hairline separators, and no floating shadows.
Keep header alignment shared with Browser, Files, and Terminal.
Use foreground icons and retain ListBulletsIcon for the overview toggle.

Reuse the panel resize seam, persisted width, keyboard resizing, and reset gesture.
Verify the existing 280–560 px queue bounds and narrow-container behavior with real layout measurements.
Use the existing mobile detail presentation rather than introducing nested horizontal panes.

Every icon action has an accessible name. Rows support normal keyboard activation.
Returning from preview restores focus to the originating row.
Do not capture arrow keys used by terminal, editor, address bar, or preview content.
Long names truncate visually with an accessible full name. Containers allow shrinking without horizontal page overflow.

## Data and failure states

Use skeleton rows while loading, a factual empty state, actionable errors, and populated rows.
Separate no results from no matching results. Search provides a clear-filter action.
Unsupported previews offer existing download or open actions when available.
Do not fabricate an action when the source supplies no usable path or URL.
Retry only through existing viewer/query mechanisms.
Missing usage data never blocks queue rendering.
No customer information enters fixtures, screenshots, commits, or review artifacts.

## Product measurement

Proposed metric: `session_result_preview_open`, emitted once per explicit queue open.
Properties: alternative number, result kind, and source surface only.
Exclude names, paths, URLs, prompts, and account/session identifiers.
Reuse the existing analytics adapter if it supports this event. Do not add a telemetry dependency.

Usability acceptance: each alternative completes the same synthetic five-result scenario without a dead action.
Selecting a result takes one activation; returning to the queue takes one activation.
All nineteen must preserve queue position after preview and tool switching.
Comparison variants are temporary. After selection, remove the eighteen losing alternatives and picker plumbing.
No automatic deadline or scheduled task is created by this specification.

## Verification

Run package T0 checks and only targeted files covering changed behavior.
Do not run the whole package suite.
Exercise the actual local session page with synthetic outputs and changed files.

For every option 2–20, assert: select option, inspect results, open preview, navigate siblings, Back, restore selection.
Also cover no outputs with changes, no matches, unsupported preview, removed result, and new output during review.
Check resize by pointer and keyboard, reset, reload persistence, narrow viewport, mobile, and both themes.
Verify Browser/Files/Terminal switching preserves queue and terminal state.
Verify a changed-file selection displays the selected path's diff.
Inspect network traffic to confirm reuse of SDK requests and correct resource selection.

Record exact commands and observed outputs. State any unavailable input or unverified surface explicitly.

## Scope

This task replaces the nineteen comparison alternatives and preserves the docked session shell.
It does not add server-side review status, approve/reject APIs, publishing, or a new artifact system.
Translate shared production copy through the existing UI catalog before shipping.

## Self-review

The nineteen alternatives are specified and numbered against the current picker.
Shared preview navigation, state restoration, failures, accessibility, and real-surface verification are explicit.
Review queue does not imply unimplemented approval state.
The baseline and existing plan/tool surfaces are preserved.
