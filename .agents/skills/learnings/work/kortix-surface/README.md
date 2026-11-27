---
title: One Kortix surface: catalog, connector, SDK, CLI, MCP
status: design agreed with Marko 2026-11-27, not built
owner: unassigned (overlaps the tool-parity work on branch tool-surface-parity)
updated: 2026-11-27
---

# One Kortix surface

Marko, 2026-11-27: "we want the cleanest design e2e for all things,
flawlessly." Every way to act on Kortix (agent tools, MCP, the CLI, the SDK,
connectors) is a client of one operation catalog; every capability an agent
has is a connector behind one gateway.

## Layers

1. **API routes:** the truth. Handlers plus the IAM check on every call.
2. **Operation catalog:** generated from the routes. Each operation has a
   stable id, input and output schemas, and the IAM action it needs.
3. **SDK:** one generic `call(operation, args)` and a typed client generated
   from the catalog.
4. **The `kortix` connector:** the same catalog seen as a connector in the
   gateway, served in-process, acting as the calling session.
5. **Clients:**
   - MCP: three verbs over every connector (`find_actions`,
     `describe_action`, `call_action`) plus featured actions generated from
     the catalog. Today's hand-written tools become `kortix` connector
     actions; `call_api`, `search_api`, `describe_api` are aliases for a
     deprecation window.
   - Agent tools: the same verbs; the `kortix_*` tools become featured
     actions with cards.
   - CLI: commands generated from the catalog (names, flags, help from the
     schemas); only machine-local commands are hand-written (`login`,
     `worktree`, `ship`, `tui`, `self-host`, `doctor`, streamed file
     transfers).

## Permissions

- Every agent keeps its own identity: a service account and a
  session-bound token.
- Ceiling: the IAM role bound to that service account.
- Scopes: the agent's rule set on the `kortix` connector (allow, ask, block
  per IAM action), the same format as every connector's rules. It replaces
  `kortix_permissions`; old lists read as "allow these, block the rest".
- The API enforces role and rules on every call with an agent token, by any
  path: block is 403, ask creates a held call and answers 202 with the
  approval link. The no-self-raise check stays on every rule-set write.
- Keys an agent mints carry the minter's limits and its id; revoking the
  minter revokes them. With that, minting leaves `HUMAN_ONLY`; paying and
  deleting the workspace or account become "always ask", never "allow".

## Order

1. The operation catalog (ids, schemas, IAM action) for all 1,684 operations.
2. The API enforces agent rules, with "ask".
3. The `kortix` connector from the catalog.
4. MCP: three verbs plus featured actions.
5. The CLI generated from the catalog.
6. The `kortix_*` tools as featured actions.

## Ideas taken from executor (UsefulSoftwareCo/executor, MIT; reviewed 2026-11-27)

- An `execute` verb next to find, describe and call: the agent writes a
  small program over the catalog (the harness `codemode`), so big results are
  filtered before they reach the model.
- Rules can decide on the arguments, not only the action (ask when an amount
  is above a limit).
- One approval flow: the call answers "approval required" with a request id;
  the agent resumes by that id; nothing is ever rerun.
- An action whose account is not connected for the caller is hidden; calling
  it answers "account required".
- Every result carries a call-log reference id.
- Read versus write is a first-class scope.
- The entry skill is sent as MCP `instructions` when a client connects.

## Removed, not kept beside the new surface (Marko, 2026-11-27: "hardcore rm")

Each goes in the phase that replaces it, with no compatibility layer:

- the hand-written MCP tools (`start_session`, `read_session`, `run_command`,
  `read_file`, `call_api`, `search_api`, `describe_api`, …);
- the 9 `kortix_*` platform tools and their CLI-spawning helper;
- `kortix_permissions` as a separate grant system (the parser still reads
  the old key in customer `kortix.yaml` files as rules, because those files
  live in customer repositories);
- the hand-written CLI commands that the generated ones replace.

## Classifying a route (phase 1)

`apps/api/scripts/operation-catalog.ts` lists every concrete route of the
real Hono table and checks each one. Run it with the placeholder env from
`dump-routes.ts`; `--check` fails on an unclassified route that is not on the
shrinking baseline (`operation-catalog.baseline.json`), on a baseline entry
that is classified now, on a duplicate id and on a stale exclusion.

Every `createRoute({...})` gets three fields:

1. **`operationId`**: dotted, lower case, unique, from the canonical path and
   the verb. Domain first, then the resource chain, then the verb:
   `sessions.list`, `sessions.get`, `sessions.create`, `sessions.messages.send`,
   `secrets.set`, `connectors.accounts.list`, `change_requests.merge`. Verbs:
   `list`, `get`, `create`, `update`, `delete`, `set` (upsert), or the
   domain's own verb (`start`, `stop`, `merge`, `send`, `connect`). Words in a
   segment join with `_`. An id never changes once shipped.
2. **`'x-kortix-action'`**: the IAM action the handler checks
   (`assertAuthorized(actor, ACTION)`, `assertAgentScope(c, 'project.x.y')`,
   the tier `loadProjectForUser` asks for). The exact string the handler uses,
   legacy spelling included. When it checks several, the one that decides for
   an agent session; when the check depends on the input, the strictest.
   `none` only when the handler checks no IAM action at all (public, a
   webhook verified by signature, the caller's own profile).
3. **`'x-kortix-exposure'`**:
   - `agent`: agents and people reach it through every client (the default
     for workspace work: sessions, files, secrets, connectors, agents, triggers…);
   - `human`: people only: sign-in and OAuth flows, payment and checkout, a
     page that shows a secret once, account deletion;
   - `internal`: no client: provider webhooks, sandbox and daemon callbacks,
     platform admin (`/v1/admin`, `/v1/ops`), health checks;
   - `local`: a machine-local CLI concern the API serves (device login, CLI
     token exchange).

An untyped route (`app.get('/x', …)`) becomes a `createRoute`, or, when it is
not an operation (a raw passthrough, a protocol endpoint), an entry in
`operation-catalog.exclusions.json` with the reason. Removing a dead route is
better than classifying it.
