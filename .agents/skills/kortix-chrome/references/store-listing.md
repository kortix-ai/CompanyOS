# Chrome Web Store listing

The text of every field in the Chrome Web Store dashboard for the Kortix extension
(item `gefbbnjgoiljpbnalgafbhbfdhikgjek`, publisher "Kortix"). Paste it as written. When
`src/manifest.json` gains or loses a permission, change its justification here in the same
commit, and update the dashboard before the next upload.

The dashboard holds this text since 2026-10-13 (Marko); 2026-11-18 added `contextMenus`, the
side panel parts of `scripting` and the host permission, User activity, and the privacy URL fix.
The Code column names where each permission is used.

## Package

`bun run package` in `apps/chrome-extension` writes `release/kortix-chrome-<version>.zip`.
Dashboard → **Package** → **Upload new package**. The store accepts only a version higher than
the last upload.

## Store listing tab

| Field | Value |
|---|---|
| Name | `Kortix` (from the manifest) |
| Summary | `Let Kortix agents use this browser, with you watching.` (from the manifest) |
| Category | Workflow & Planning |
| Language | English |
| Store icon | `apps/chrome-extension/icons/128.png` |
| Screenshots | 5 × 1280 × 800, uploaded 2026-10-13 |
| Small promo tile | 440 × 280 "Kortix for Chrome", uploaded 2026-10-13 |
| Marquee promo tile | 1400 × 560, uploaded 2026-10-13 |
| Official URL | none |
| Homepage URL | `https://kortix.com` |
| Support URL | `https://kortix.com/support` (redirects to `/contact`; the store fetches it before it allows a submit) |

### Description

```text
Kortix connects this browser to your Kortix workspace. Ask any Kortix session to use your browser, and the agent works in it with the sites you are already signed in to: your inbox, your dashboards, your company tools.

While an agent works, you see:
• its tabs, with a glow around the page and the agent's cursor
• a bar on the page with Take over and Stop
• Kortix in Chrome's side panel, next to the page

You decide what it can do:
• Access: without asking, ask first, or off
• Tabs: all your tabs, or only the tabs it opens
• Stop ends a session's access at once

How it works: you sign in to Kortix once. Sessions run in Kortix's cloud and reach this browser through the extension. Nothing runs until a session asks, and only sessions you started can ask.

Requires a Kortix account (kortix.com).
```

## Privacy tab

### Single purpose

```text
Let the user's Kortix agent sessions operate this browser (open, read and act on web pages) on the user's request, with visible state on the page and a Stop control.
```

### Permission justifications

| Permission | Justification | Code |
|---|---|---|
| `debugger` | `Kortix agents open, read and click pages through the Chrome DevTools Protocol, only in the tabs a session the user started may use. Chrome shows its debugging notice while it is attached, and the user can stop it at any time.` | `background/shim.ts` |
| `tabs` | `List the user's open tabs when the user allows it, open and close the tabs a session uses, and follow their URL and title so the agent and the user see the same state.` | `background/shim.ts`, `hub.ts` |
| `tabGroups` | `Keep the tabs a session uses together in a named 'Kortix · <session>' tab group, so the user sees which tabs an agent works in.` | `background/attachment.ts` |
| `scripting` | `Draw the on-page glow, the agent cursor and the Take over / Stop bar in the tabs a session uses. When the user sends the current page from the side panel, read that page's text so the session can answer about it.` | `hub.ts` (`overlay.js`), `pages/sidepanel.ts` (`readPage`) |
| `storage` | `Keep the user's Kortix sign-in, the chosen Kortix server and the user's settings (access mode, tab scope) in the browser.` | `background/state.ts` |
| `alarms` | `Reconnect to Kortix after the network or the Kortix server restarts, so the browser stays available to the user's sessions.` | `background/index.ts` (`keepalive`, 30 s) |
| `sidePanel` | `Show Kortix in Chrome's side panel next to the page, so the user follows and steers the session while it works.` | `background/index.ts` |
| `contextMenus` | `Add "Ask Kortix about this page" and "Ask Kortix about this selection" to the right-click menu. Each opens the Kortix side panel with that page, or with the selected text as a quote, so the user can ask a session about it.` | `background/index.ts` |
| Host permission `<all_urls>` | `The agent works on the sites the user asks it to use, which can be any site, and the visible overlay (glow, cursor, Stop bar) must appear on any page a session uses. When the user sends the current tab from the side panel, the extension reads its text and, if the user asks, takes a screenshot of it; that tab can be any site.` | `pages/sidepanel.ts` (`captureVisibleTab`) |

### Remote code

`No, I am not using remote code.` Every script ships in the package. A session sends Chrome
DevTools Protocol commands as data through `chrome.debugger`. The extension loads no script
from the network and runs no `eval`.

### Data usage

Select:

- **Authentication information**: the OAuth tokens for the person's Kortix account.
- **Web history**: with "All tabs", a session sees the address and title of open tabs.
- **User activity**: while a session controls a tab, it can watch the page's network requests through the debugger.
- **Website content**: page text, screenshots and page data a session reads, and the page the person sends from the side panel.

Leave the others unselected. Tick all three certifications: no sale, no use unrelated to the
single purpose, no use for creditworthiness or lending.

Privacy policy URL: `https://kortix.com/legal?tab=privacy` (`/legal/privacy` is a 404). Its
section "Kortix in Chrome" (`#chrome-extension`) states what the extension keeps, what it sends
and the Limited Use statement. Change that section and this table together.

## Distribution tab

- Visibility: **Public**. Regions: all.
- Before launch (`CHROME_LAUNCHED` false): turn on **deferred publishing** before you submit, so
  an approved version waits until the launch PR is live. Then **Publish** in the dashboard.

## Test instructions tab

The reviewer signs in at kortix.com with a reviewer account whose project has the `chrome` flag
on. The credentials go into this tab only, never into git, Slack or a PR.

```text
1. Install the extension. The welcome tab opens. Select "Connect to Kortix".
2. Sign in at kortix.com with the account above (email and password), then select Allow.
3. Back on the welcome tab, keep the defaults and select Done.
4. Open https://kortix.com, open the project "Chrome review", and start a new session.
5. Send: "Use my Chrome to open https://example.com and tell me the page title."
6. A tab group named after the session opens with example.com. The bar at the bottom right shows "Kortix is working" with Take over and Stop. The session answers with the title.
7. Select Stop on the page, or press Alt+Shift+K. The session loses access to the browser.
8. Side panel: click the toolbar icon, type a question about the current page, and send it.
```

## Graphic assets

| Asset | Size | Content |
|---|---|---|
| Store icon | 128 × 128 PNG | `icons/128.png` |
| Screenshots | 1280 × 800 | 5 in the dashboard (2026-10-13): "Your agents, in your browser", "Kortix next to the page", "You choose what it can do", "Stop any time", "Connect in one click" |
| Small promo tile | 440 × 280 | "Kortix for Chrome" with the working bar |
| Marquee promo tile | 1400 × 560 | "Your agents, in your browser." |
