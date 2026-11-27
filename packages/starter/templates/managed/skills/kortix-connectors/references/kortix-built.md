# Kortix-built connectors

Kortix serves these connectors itself. They need no sign-in: installing one
mints its account, and install answers `Ready`. Rules, approvals and the call
log apply to them like to every connector.

```sh
kortix connectors catalog install kortix:kortix_toolbox            # slug kortix-toolbox
kortix connectors catalog install kortix:kortix_browser            # slug kortix-browser
kortix connectors catalog install kortix:kortix_agent_authenticator # slug kortix-agent-authenticator
kortix connectors catalog install kortix:kortix_phone              # slug kortix-phone, where the server has a phone provider
```

## Kortix Toolbox: paid tools, billed to credits

Reach for Toolbox first when the work needs a paid data or generation tool
the workspace has no account for: people and company data, email finding
and checking, SEO, social profiles, jobs, market data, maps, more search
engines and scrapers, image, video, speech and music generation. Kortix holds
the provider keys and bills the workspace's credits at each call's real cost.

| Action | Use |
|---|---|
| `search` | Web search with an answer, results and images |
| `scrape` | Up to 10 pages as markdown |
| `map` | A site's URLs, then scrape the ones you need |
| `image_search` | Images with their source pages |
| `find_tools` | The catalog, by what you need done; each tool has an id and its price in credits |
| `describe_tool` | One tool's parameters and an example request |
| `call_tool` | Run it: `query` for query parameters, `body` for a JSON body |
| `check_task` | Follow a background task (image and video generation) until it finishes |

Steps for a catalog tool:

1. `find_tools` with what you need done. Pick the tool by what it returns
   and its credits.
2. `describe_tool` with its id. Build the call from `input` and `example`.
3. `call_tool`. A data tool answers at once. A generation tool answers
   `task` and `state: processing`.
4. For a task: `check_task` with `wait_seconds` (up to 60), again while it
   is processing. The result is file links valid for about a day: download
   them into the workspace at once.

Done when the result is in a file or in your answer, and every link you will
need later is downloaded.

- A failed task refunds its credits; a tool's own error (no result, a bad
  parameter) costs nothing.
- A tool that acts on an account of the workspace's own (ads, analytics,
  posting) is not in Toolbox: install that app as a regular connector and
  connect the workspace's account.
- One call is capped (data tools at a few credits, generation at the price
  of a long video clip); a refusal names the cap.

## Kortix Browser: the workspace's own signed-in browser

One browser identity per account: its saved logins and its stored site
passwords. Every session gets its own copy, started signed in everywhere the
identity saved a login, so copies run side by side.

| Action | Use |
|---|---|
| `connect` | Your session's copy and a short-lived CDP URL |
| `save_login` | After signing in: save that site's login for every copy |
| `logins` | Known sites and usernames (never passwords) |
| `remember_login` | Store a username and password, or `generate_password` for a sign-up; `forget` deletes one |
| `fill_login` | Type the stored login into your copy's sign-in form; the password never passes through you |
| `copies` · `release` | The open copies; close yours when done |
| `reset` | Close every copy and delete every saved login |

Drive the page yourself with the CDP URL:

```sh
kortix connectors call kortix-browser connect '{}' --out /tmp/browser.json
CDP=$(jq -r .data.result.structuredContent.cdp_url /tmp/browser.json)
agent-browser --cdp "$CDP" open https://example.com/login
```

Steps to sign in to a site:

1. `connect`, then open the sign-in page with agent-browser.
2. `logins`: a stored login for the site means `fill_login` with `submit:
   true`. No stored login and a new account: `remember_login` with the
   username and `generate_password: true`, then `fill_login` on the sign-up
   form.
3. Pass the checks the site asks for: a code by email (the workspace's
   inbox), by text message (`kortix-phone` `wait_for_code`), or a 2FA app
   (`kortix-agent-authenticator` `get_code`).
4. `save_login` with the site.

Done when the site shows you signed in and `logins` lists it with a
`saved_at` time.

The CDP URL is a credential: keep it in a shell variable or a file under
`/tmp`, never in a message or a committed file.

## Kortix Agent Authenticator: 2FA codes

| Action | Use |
|---|---|
| `add_account` | Store the key a site shows when you turn on two-factor sign-in (the `otpauth://` URI behind the QR code, or the setup key); it answers the first code |
| `get_code` | The current code, by id, label, issuer or account |
| `list_accounts` | Stored keys (never the secrets) |
| `remove_account` | Delete one, after two-factor sign-in is off on that site |

## Kortix Phone: a number of its own

| Action | Use |
|---|---|
| `get_number` | The account's number; the first call buys one (country, area code) |
| `wait_for_code` | Wait for the text a site sends; pass `since` from just before you asked for it |
| `list_messages` | Received texts, newest first, with the codes found in each |
| `send_sms` | Send a text from the number |
| `release_number` | Give the number up for good |

The catalog lists Kortix Phone only where the Kortix server has a phone
provider set up.
