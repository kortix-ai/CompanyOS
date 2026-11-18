# Chrome Web Store listing

The text of every field in the Chrome Web Store dashboard for the Kortix extension
(item `gefbbnjgoiljpbnalgafbhbfdhikgjek`, publisher "Kortix"). Paste it as written. When
`src/manifest.json` gains or loses a permission, change its justification here in the same
commit, and update the dashboard before the next upload.

Each claim traces to code: the permission rows name the call that needs the permission.

## Package

`bun run package` in `apps/chrome-extension` writes `release/kortix-chrome-<version>.zip`.
Dashboard → **Package** → **Upload new package**. The store accepts only a version higher than
the last upload.

## Store listing tab

| Field | Value |
|---|---|
| Name | `Kortix` (from the manifest) |
| Summary | `Let Kortix agents use this browser, with you watching.` (from the manifest) |
| Category | Productivity → Tools |
| Language | English |
| Store icon | `apps/chrome-extension/icons/128.png` |
| Screenshots | 1280 × 800, see [Graphic assets](#graphic-assets) |
| Small promo tile | 440 × 280, see [Graphic assets](#graphic-assets) |
| Official URL | none |
| Homepage URL | `https://kortix.com` |
| Support URL | `https://kortix.com/support` (the store fetches it before it allows a submit) |

### Description

```text
Kortix in Chrome connects your own browser to Kortix. After you sign in once, your Kortix sessions can open pages, read them, click and type in them, with the logins you already have. You watch every step and can stop it at any time.

What you see while an agent works
• Every tab a session uses goes into a tab group named after the session.
• A bar on the page shows that Kortix is working, with Take over and Stop.
• Alt+Shift+K stops every agent in this browser.

You decide what agents can reach
• Access: a session uses the browser without asking, asks you first, or never.
• Tabs: a session reaches all your tabs, or only the tabs it opens.
• chrome:// pages, the Chrome Web Store and other extensions are never reachable.

The side panel
Click the toolbar icon, or press Alt+K, to open Kortix next to the page. Ask about the page you are on, pick a project, and send. Right-click a page or a selection and choose "Ask Kortix".

Requirements
A Kortix account at kortix.com. Chrome 125 or later, or Edge, Brave and Arc.

Privacy
The extension reads a page only when a session or you ask it to. It contains no analytics or advertising code. Kortix handles the page content a session reads as your session's content. Details: https://kortix.com/legal?tab=privacy#chrome-extension
```

## Privacy tab

### Single purpose

```text
Kortix in Chrome lets a person's own Kortix sessions use their Chrome browser: open tabs, read pages and act on them in a tab group named after the session, while the person watches and can stop it. The side panel lets the person send the current page to a Kortix session.
```

### Permission justifications

| Permission | Justification |
|---|---|
| `debugger` | `A Kortix session controls the tabs in its own tab group through the Chrome DevTools Protocol: it navigates, reads the page, takes screenshots, clicks and types. chrome.debugger attaches to those tabs only while the session is connected, and Chrome shows its "is debugging this browser" bar.` |
| `tabs` | `Creates the tabs a session asks for, lists the tabs a session may reach (all tabs or only the session's own, as the person chooses), activates a tab before a screenshot, and closes tabs the session opened.` |
| `tabGroups` | `Puts every tab a session uses into a tab group named after the session, so the person sees which tabs an agent controls: the group gets the session's title and a blue color.` |
| `scripting` | `Injects the on-page bar that shows "Kortix is working" with Take over and Stop into the tabs a session controls, and reads the text of the current page when the person sends it from the side panel.` |
| `storage` | `Keeps the sign-in tokens for the person's Kortix account, the server address and the person's settings (browser name, access mode, tab scope) on the device.` |
| `alarms` | `Wakes the service worker every 30 seconds to keep the connection to Kortix open, so a session can reach the browser while it is online.` |
| `sidePanel` | `The toolbar icon and Alt+K open the Kortix side panel next to the page, where the person asks about the page and follows the session.` |
| `contextMenus` | `Adds "Ask Kortix about this page" and "Ask Kortix about this selection" to the right-click menu. They open the side panel with that page or selection.` |
| Host permission `<all_urls>` | `The person decides which sites a session works on, at the time of the task, and with "All tabs" a session may reach any http, https or file tab. The side panel reads and screenshots the current tab only when the person sends it. A fixed list of sites cannot cover this.` |

### Remote code

`No, I am not using remote code.` Every script ships in the package. A session sends Chrome
DevTools Protocol commands as data through `chrome.debugger`. The extension loads no script
from the network and runs no `eval`.

### Data usage

Select:

- **Authentication information**: the OAuth tokens for the person's Kortix account.
- **Web history**: with "All tabs", a session sees the address and title of open tabs.
- **User activity**: a session can observe the page's network events and input while it controls a tab.
- **Website content**: page text, screenshots and page data a session reads, and the page the person sends from the side panel.

Leave the others unselected. Tick all three certifications: no sale, no use unrelated to the
single purpose, no use for creditworthiness or lending.

Privacy policy URL: `https://kortix.com/legal?tab=privacy`. Its section "Kortix in Chrome"
(`#chrome-extension`) states what the extension keeps, what it sends and the Limited Use
statement. Change that section and this table together.

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
| Screenshot 1 | 1280 × 800 | A page in a session's tab group with the "Kortix is working" bar |
| Screenshot 2 | 1280 × 800 | The welcome page: "Let Kortix use this browser" |
| Screenshot 3 | 1280 × 800 | The side panel next to a page |
| Screenshot 4 | 1280 × 800 | The settings page: access and tabs |
| Small promo tile | 440 × 280 PNG | Kortix symbol and "Kortix in Chrome" |
