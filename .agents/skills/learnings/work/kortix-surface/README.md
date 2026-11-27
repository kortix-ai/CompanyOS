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
