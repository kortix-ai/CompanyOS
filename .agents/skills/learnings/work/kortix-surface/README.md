---
title: One Kortix surface: catalog, connector, SDK, CLI, MCP
status: phase 1 built (9dc091f72e); phase 2 in progress
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

1. **Done (9dc091f72e):** the operation catalog: 1,000 operations, 118
   exclusions, enforced by `unit-operation-catalog.test.ts`.
2. **2a, built and verified.** The API knows each request's operation and
   decides allow or block for every agent-session token (design below).
   Flows `WS-AUTH-17` (new) and `WS-AUTH-5/8/15`, `SCOPE-5`, `CR-15`,
   `AGP-1…14` pass.
3. **3, built.** The `kortix` connector from the catalog, in-process
   (`connectors/kortix-agent/kortix.ts`); find and describe are the gateway's
   own. `execute` lands with MCP (phase 5). Flow `WS-AUTH-18`.
4. **2b, built.** "Ask": the gate hands the request to the gateway as a
   `kortix` call; held, approved, run once. Flow `WS-AUTH-18`.
5. **2c, built.** Session trust in `project_sessions.metadata.trust`
   (`shared/session-trust.ts`). Email, Discord, Telegram and chat question
   answers mark the session untrusted; Slack and Teams do unless
   `*_REQUIRE_USER_IDENTITY` resolved a linked member. A session created,
   forked or spawned by an untrusted one is untrusted. The gate and the
   gateway apply the untrusted rules (`untrustedDecision`). Flow
   `WS-AUTH-19`.
6. **2d, built.** Phone: `KORTIX_PHONE_SMS_PREFIXES` (calling codes) and
   `KORTIX_PHONE_SMS_DAILY_CAP` (per account per UTC day, counted in the
   account state before the send).
7. **4, built.** SDK `callOperation(id, args)`, `listOperations()`,
   `kortix.call`, `kortix.operations` over a catalog the catalog script
   generates (`packages/sdk/src/core/rest/operations.generated.ts`, checked
   by `--check`). Typed per-operation inputs and outputs are not generated
   yet: `OperationId` is a typed union, arguments and results are not.
8. MCP: the verbs plus featured actions plus instructions; old tools removed.
9. The CLI generated from the catalog.
10. Featured actions replace the `kortix_*` tools; agent-minted keys carry
    the minter's limits; `HUMAN_ONLY` becomes "always ask".

## Phase 2: agent rules on the Kortix API

One rule engine and one hold system for every connector, `kortix`
included: `connectors/policy.ts` (`resolveEffectiveRule`: allow, ask, block,
argument conditions, per-agent policy sets) and the gateway's held calls
(`connectors/held-call-run.ts`: an approved call runs once, as its caller,
and the session resumes). No second engine.

- **The operation of a request.** At boot the API builds the registry from
  its own routes (the same join as `scripts/operation-catalog.ts`). A
  middleware after auth finds the matched route and sets
  `c.get('operation')`: `{ id, action, exposure }`.
- **Who is gated.** Every request whose credential is `agent_session`,
  governed or not. People, PATs and workspace keys keep their IAM path.
- **The decision**, in order; the first answer wins:
  1. exposure `human`: block (`operation_not_for_agents`). `local` and
     `internal` operations keep their own checks: a session box uses
     `git_token.create` (local) for git.
  2. the session is untrusted: the untrusted rules (2c), which nothing can
     loosen.
  3. project `policies:` whose pattern names `kortix.` (`kortix.secrets.*`).
     A pattern that does not (`*`, `*.delete*`) is about the other
     connectors: a workspace's `*: require_approval` would otherwise stop
     every agent read of its own workspace.
  4. the agent's policy set on `kortix` (`agents.<a>.policy_sets.kortix`);
     else its old `kortix_permissions` list read as rules: allow an
     operation whose action is listed (or is `project.read`,
     `project.write` or `none`), block every other one. `all` (or no list)
     allows. `sessions.stop` also accepts `project.session.start`, the action
     its old check asked.
  5. the `kortix` connector's base rules, when kortix.yaml declares them.
  6. allow. The IAM role (the ceiling) still decides inside the handler.
- **The answers.** Allow: the handler runs. Block: `403`
  `{ error: 'policy_block', operation, reason }`. Ask (2b): `202`
  `{ status: 'pending_approval', execution_id, approval_url,
  runs_on_approval: true }`; after approval Kortix runs the stored request
  once and resumes the session; the agent reads the result by
  `execution_id`, never repeats the call.
- **Removed in 2a:** the grant fold in `authorize.ts` (step 10 and the
  grant half of `agentPrincipalDecision`), `assertAgentScope` at its 32 call
  sites, `agentMayPerform` (its list reading is `agentListAllows` in
  `iam/kortix-rules.ts`, used by the five checks that ask the list outside a
  route: self merge, peer prompts, chat threads, artifacts, repository
  access at session create). The ceiling (bound role) and `HUMAN_ONLY` stay
  in `authorize`. The no-self-raise check (`agent-grant-ceiling.ts`) stays on
  every rule-set write. Git refs keep their own default-deny grant reading
  (`git-proxy/ref-scopes.ts`): git is a protocol, not an operation.
- **Code:** `shared/operation-registry.ts` (the route join, shared with
  `scripts/operation-catalog.ts`), `iam/kortix-rules.ts` (the decision),
  `middleware/agent-operation-gate.ts` (called by `auth.ts` and
  `auth-combined.ts` right after a session token is accepted),
  `connectors/project-policies.ts` (the one query the gate makes).

## Phase 3 and 2b: the `kortix` connector, and "ask"

- **One more Kortix-built server.** Service `kortix` at
  `https://agent.mcp.kortix.com/kortix`, in-process like Toolbox. Sync
  synthesizes it in every project (as it does channel and computer
  connectors); it is never written to git. A kortix.yaml entry with slug
  `kortix` adds base rules and policy sets; its URL cannot change.
- **Tools are the operations.** `tools/list` answers every `agent`
  operation of the registry: name = operation id, description = summary,
  input = path and query parameters as properties plus `body` (the JSON
  body schema). `GET` is read-only, `DELETE` destructive, the rest write.
  The gateway's own search and describe find them; no special verbs.
- **A call acts as its caller.** The gateway sends a signed
  `x-kortix-caller` header (token id, session, expiry, HMAC): a static
  header a kortix.yaml connector declares cannot forge it. The server runs
  the route in-process (`app.fetch` with a symbol on `env`, which no HTTP
  request can set); auth loads the token by id. The server refuses an
  operation that is not `agent` or that the caller's list refuses; the
  gateway decides the rules (project, policy set, base rules), holds,
  approvals and the call log, and the in-process request skips the agent
  gate (decided already).
- **Default allow.** The gateway reads `allow_all` for `kortix` whatever the
  project's `default_mode`: the IAM ceiling governs, and the direct API and
  the connector must agree.
- **Ask on the direct API (2b).** When the gate answers ask, it hands the
  request to the gateway as a `kortix` call: the answer is the gateway's
  `pending_approval` with `execution_id` and the approval link, status
  `202`. After approval the held run executes it once through the server
  and resumes the session. Every result names its `execution_id`.

### Trust (2c)

Inclusion lists decide who may wake the agent (spam and cost). They are not
the security boundary: `isEmailSenderAllowed` matches the `From` header only,
and an allowed sender can still forward an attack. Authority comes from the
session's trust:

- **Principal:** a workspace member on a channel that proves identity: the
  app, Slack or Teams with a linked identity. An email is never a principal:
  Resend's Inboxes API returns no SPF, DKIM or DMARC result (checked
  2026-11-28, `inbox.email.received` and "Retrieve Thread Email"), and a
  `From` header is forged in one line. A text message is never a principal
  either.
- **Untrusted:** a session that received a message from anyone else. It
  stays untrusted until it ends. Approving one call does not clear it.
- **Untrusted rules** (code, evaluated before every workspace rule):

  | Action | Untrusted |
  |---|---|
  | reads, search, Toolbox data tools, a reply in the same thread | allow |
  | a send to a new recipient, any other connector write | ask |
  | edits to skills, triggers, rules, memory, kortix.yaml | ask |
  | reveal a secret, issue a credential or key, change members | block |

- **Taint follows creation:** a session created, forked or spawned by an
  untrusted session is untrusted (`session-create.ts`). A trigger, a
  script, a skill or a kortix.yaml edit by an untrusted session is a write,
  so it asks: a person approves what would run later.
- **The gateway call itself** (`connectors.call`) has no untrusted answer:
  the gateway applies the rules to the connector action inside it.
- **Web pages do not taint** (Marko may overrule): nearly every session reads
  the web. Text a stranger addressed to the agent does.

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
