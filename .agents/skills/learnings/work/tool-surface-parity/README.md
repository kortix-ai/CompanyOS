---
title: CLI, agent tool and hosted MCP capability parity
status: architecture evaluation; implementation awaits architecture decision
owner: engineering
updated: 2026-11-27
---

# Recommendation

Choose **A: API-canonical contracts with explicit composite/client extras**. Keep REST authorization and handlers authoritative. Generate MCP tools and grouped agent action schemas from those contracts; bind CLI leaves to the same operation identifiers. Use the SDK transport in the agent runtime, not MCP as a mandatory internal hop. MCP remains an external protocol projection, not the business API.

This is a recommendation, not an implemented registry. No existing tool, permission or handler changes in this phase.

## Observed implementation

Investigation base: `530d5608c3` in CompanyOS. Paths below are repository-relative.

| Surface | Registration | Execution |
| --- | --- | --- |
| CLI | `apps/cli/src/index.ts` `COMMAND_HANDLERS`; children in `commands/*.ts` use switches and early branches | `api/client.ts` wraps `api/sdk.ts`, which owns `createKortix` and SDK transport |
| Agent | `apps/kortix-sandbox-agent-server/src/services/tools/host.ts` `PLATFORM_TOOLS`; nine platform modules | `services/tools/platform/platform.ts` spawns `kortix` with argv; memory instead calls API directly |
| Runtime | `harness/pi/runtime.ts` loads executable modules; `harness/pi/tools.ts` adapts them to pi | Object JSON Schema, optional pre-permission validation, runtime permission gate, then execution; text result |
| MCP | `apps/api/src/app.ts` mounts `/v1/mcp`; `mcp/index.ts`, `connectors.ts`, `cli.ts` maintain tool definitions | Most tools dispatch authenticated Requests through the actual API app in-process; generic `kortix` launches a server CLI |
| API | Hono route registrations; typed routes through `@hono/zod-openapi` and `packages/api-contract` | Existing routes enforce actor, workspace, feature, role and agent scope |

The CLI help catalog (`command-table.ts`) is not the execution tree. Root aliases can transform arguments. Session commands dispatch before their main switch. Connector actions are a runtime catalog, not static CLI leaves. A regex over help or every switch case cannot establish exhaustive parity.

The API route inventory (`apps/api/scripts/dump-routes.ts`, `tests/spec/routes.generated.json`) comes from the real Hono table. It includes aliases and ALL passthroughs. Public OpenAPI is filtered: `openapi/index.ts` strips admin/ops schemas and marks public operations. It is therefore not a complete internal capability inventory. Existing bearer metadata is not per-operation permission metadata. A generated registry must not treat every authenticated route as agent-safe.

## Options

| Concern | A. API contracts canonical + extras | B. Operation registry above API | C. MCP canonical |
| --- | --- | --- | --- |
| Source of truth | Route contract contains stable ID, request/response, authorization policy reference and exposure classification | New operation owns schema, policy reference and handler; REST becomes an adapter or duplicates its definition | MCP tool input/output and execution own the contract; REST/CLI adapt |
| Deterministic guarantee | Generate tool projections; require each real route and CLI leaf to classify/bind; reject orphan bindings and unclassified extras | Generate MCP from registry; enforce every CLI leaf and REST route binding; forbid bypass handlers | Generate CLI/tool bindings; require every REST route to map or exclude; protocol schema alone cannot enforce this |
| Extras | Explicit graph of composite operations to route IDs; local adapters for bytes, streaming, terminal UX and cards | Composite ops can fit, but local file reads still need client adapters | Must add non-MCP local/client layer anyway; streaming and file UX do not disappear |
| Authorization | Reuse route actor and policy enforcement; metadata references it, never replaces it | Safe only if registry handler reuses the same enforcement or REST routes move behind it | MCP must reproduce or dispatch existing REST enforcement; protocol annotations are not authorization |
| Agent transport | SDK to API; MCP is optional, not another required failure boundary | SDK operation endpoint or MCP client; neither is inherently necessary | Mandatory MCP client and version negotiation |
| Latency | One HTTP hop from sandbox; removes CLI process startup where migrated | One hop if direct; MCP adds envelope/negotiation unless cached | Envelope/negotiation mandatory; server CLI wrappers still spawn processes |
| Cards | Keep existing names and local renderer over typed results | Same; cannot replace old action semantics with differently shaped MCP text | Must preserve legacy card envelope inside structured results and adapter |
| Cost | Add missing policy/exposure metadata and CLI leaf declarations; reuse existing schemas/routes/SDK | Add new authoritative execution layer and migrate route handlers or retain duplicate semantics | Largest migration; retrofit REST, SDK and all CLI behavior onto a protocol currently used externally |
| Main failure mode | Claiming incomplete public OpenAPI is exhaustive; permissive body fallbacks mistaken for strict schemas | Dual truth while REST handlers still exist; bypassing route middleware from registry | JSON-RPC errors, protocol churn and deadlines become internal API dependencies; local semantics still unresolved |

A and B can converge: route-derived operation metadata is a registry. The consequential distinction is whether it **describes and projects existing API handlers** or creates a second business execution layer. Prefer the former.

## Authentication and permission boundaries

`middleware/auth.ts` resolves account PATs, including session-bound PATs, then enforces project scope. `middleware/workspace-binding.ts` explicitly assigns `/v1/mcp` credential workspace reach. Hosted MCP forwards the caller's bearer to real routes. This supports a session-bound PAT without minting a broader personal token. Legacy sandbox tokens have a separate allowlist and are not interchangeable.

Current CLI credential selection also considers linked host/workspace credentials (`apps/cli/src/command-helpers.ts`). Replacing subprocesses with explicit session-token HTTP calls changes that selection. Decide the identity contract explicitly: agent actions should act as the current session, never silently as a linked human. Test denied and cross-workspace calls before migration.

Do not infer permissions from HTTP verbs. Record dynamic policy references when resource ownership, changed manifest sections, or connector rules affect the decision. Keep secrets value redaction, access escalation, spending, external writes and destructive confirmations at the existing server boundaries. A model-provided `confirmed: true` is not proof of a person's approval. If a new approval requirement is necessary, use a server-held approval bound to actor, operation, input digest and expiry; that is a separate policy decision, not a parity side effect.

The reported CR inconsistency is partly stale CLI help. `commands/cr.ts` says agent sessions get 403. Actual `projects/change-request-policy.ts` `refusesSelfMerge` permits a session's own CR with an explicit merge grant, and permits others subject to route gates. `change-request-policy.test.ts` tests these distinctions. `kortix_change_requests` invokes the same CLI, not a privileged merge API. Do not change permissions to match the help sentence. Verify route-level tests and correct misleading help in a later implementation phase.

## Agent runtime and UI preservation

Keep the nine existing names and actions. Existing `kortix_sessions.read` extracts the latest assistant answer; MCP `read_session` returns bounded activity/transcript. These are not interchangeable results.

The card wire contract lives in `packages/api-contract/src/kortix-tool-card.ts`; the SDK parser is `packages/sdk/src/core/turns/tools/kortix-tool-card.ts`; UI is `packages/ui/src/session/tool/tools/kortix-action-tool.tsx`. Existing tools emit `{ok, tool, action, card, data?, error?}` serialized as text. An MCP result containing only `{content:[...]}` is not a card. Preserve the envelope and tool-name routing; let structured MCP output carry the same typed data without coupling API business handlers to a specific UI card.

pi accepts top-level object schemas. Its tool module validation handles constraints that model APIs reject as top-level anyOf. The existing pi adapter emits text only and no details. Native MCP extensions are not loaded. B/C therefore require a real adapter, schema compatibility, errors, abort propagation and output bounding, not a configuration toggle.

Runtime output truncates above 49 KiB or 1,990 lines. MCP text truncates at 60,000 characters. Generate bounded pages and resumable cursors; truncating JSON breaks cards and structured output. Test those limits independently.

## MCP transport and escape hatches

Current source supports protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`. It implements initialize/ping/tools/list/tools/call, rejects batches, and has no persistent SSE session. Its request budget is 55 seconds; platform CLI children allow 90 seconds. MCP generic CLI allows four concurrent children per API process. Local paths passed from a sandbox cannot be opened on the API server. App deployment, Drive uploads and artifact publishing therefore require local byte/chunk adapters, not remote CLI invocation.

The parent session reports a live v0.16.5 probe with 26 annotated tools, no outputSchema, structuredContent or icons, and no resources/prompts/completion/skills methods. These are supplied observations, not live probes run by this author. Source confirms ToolResult has only content/isError. The parent also requests a 2026-07-28 protocol upgrade and SEP-2640 Skills extension. Verify the official specification and extension status before implementing; these protocol claims have not been independently validated here.

`call_api` is not an IAM bypass: it dispatches through real routes. It is an untyped discovery/execution escape hatch, so it does not prove named operation, schema or approval parity. `kortix` has machine-local restrictions and server execution limits. Keep both compatible during migration; do not count them as typed coverage. Restrict or remove them only after explicit compatibility/security review, never silently.

Track protocol 2026-07-28 compatibility, legacy-version fallback, Skills discovery/get, skill resources, outputSchema, structuredContent, icons, Drive resources and session-log resources as separate matrix capabilities. They do not come automatically from REST tool generation. Scope resource reads to the same actor and page large content; never advertise secret values as resources.

No comparative latency benchmark has run. Before adopting mandatory MCP internally, measure cold/warm reads, writes, denials and parallel calls, including process startup and initialization overhead.

## Enforceable contract

1. Assign each concrete route a stable operation ID or an explicit exclusion. Aliases reference canonical IDs. Include parameterized runtime/passthrough routes without pretending their dynamic catalog is static.
2. Put input/output schemas, exposure, policy reference and feature gates with route contracts. Missing metadata is a build failure, not an implied public or agent-safe default.
3. Generate MCP tools and agent grouped action schemas from that projection. Keep existing card/action compatibility adapters. Validate inputs server-side, not only in tools/list descriptions.
4. Migrate the CLI to introspectable leaf registrations. Each leaf declares canonical operation IDs, composite graph or justified local exclusion. Root help and aliases derive from those registrations. AST/source hashes can provide migration inventory, but cannot prove complete semantic dispatch coverage.
5. CI compares the **real** Hono table, route contracts, reachable CLI registrations and generated tool projections. Fail for missing/stale IDs, missing schema/policy, undeclared aliases, undocumented exclusions, orphan operations and generated-file drift.
6. Mutation tests add/remove a route, CLI leaf, action or MCP projection and must fail the parity check. Runtime black-box tests assert all three surfaces send the same inputs and preserve identical denials. Mere equality of three hand-maintained lists is not enforcement.
7. New capability work cannot bypass the declaration: shared builders register route and CLI dispatch together with metadata. A legacy allowlist must contain exact entries, not wildcard exclusions for whole areas, and shrink during migration.

## Migration plan

1. Commit this evaluation and a source-derived inventory with honest unknown/unmapped permission statuses. Do not claim complete matrix coverage from help text. Record source revision and generation method.
2. Select architecture. Introduce contract metadata and parity checks in the existing test system. An interim baseline reports existing gaps but fails on new unclassified capabilities; final gate fails on every remaining in-scope gap.
3. Migrate one bounded area end-to-end, preserving old tool names and card behavior. Prove success, denial, cancellation, pagination and oversized result behavior across CLI, tools and MCP.
4. Migrate remaining areas in coherent PRs: workspace/IAM, sessions/agents/triggers, connectors/secrets, Drive/artifacts/apps, goals/evals, gateway/providers, audit/billing. Preserve local uploads and stream adapters.
5. Upgrade MCP protocol/extensions in separate compatibility-tested work after authoritative spec verification. Keep older clients working.
6. Require zero in-scope gaps, independent review and the normal factory merge gate. Merge target is the actual default branch `dev`. A matrix/test PR alone does not complete the parity objective.

## Decision options

- **A, recommended:** API-canonical contracts plus generated projections and declared extras. Least duplicate authority; keeps current SDK architecture.
- **B:** authoritative server operation layer, with REST adapters migrated behind it. Choose only if the team wants to replace route ownership as well as expose tools.
- **C:** MCP canonical. Not recommended: makes an external protocol the internal execution contract without removing local/client extras.

Chose: the existing learnings work directory instead of a new docs tree, because repository policy and checks prohibit docs/. Chose: preserve existing authorization and card contracts instead of broadening agent access or renaming tools. Registry implementation remains on hold pending the architecture decision.
