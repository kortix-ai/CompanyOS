# Landscape: Palantir, Databricks, Celonis, RPA, agent memory

Research of 2026-11-27 (five parallel reads of primary sources). What each
does, and what the Humanoid takes. Unverified points are marked.

| | What it is | Its core object | Who builds the model | Acts how |
|---|---|---|---|---|
| Palantir Foundry | An operational layer, "a digital twin of the organization" | The Ontology: object, link and action types, functions | Forward deployed engineers, bootcamps "one to five days" to a first use case | Typed actions with submission criteria, writeback to source systems, AIP agents with an action tool (auto or confirm) |
| Databricks | A lakehouse: open storage (Delta, Iceberg via UniForm), one catalog (Unity Catalog) | Tables, volumes, functions, models, MCP services in one governed namespace with lineage | The customer's data team | Agent Bricks, Unity AI Gateway policies (allow, deny, require approval), Genie agents with writes, Apps on behalf of the user |
| Celonis | Object-centric process mining | An OCEL-style event log: typed events, typed objects, qualified event-to-object and object-to-object relations | Consultants map ERP tables with SQL; batch or near-real-time extraction | Action Flows, the Orchestration Engine, an MCP server for agents (AgentC) |
| RPA (UiPath, Automation Anywhere, Power Automate) | Scripted UI bots, now "agentic orchestration" | A modeled process (UiPath Maestro: BPMN + DMN) | Process owners model the steps, developers assign bots or agents | Bots for stable steps, agents and computer use for variable ones, humans through an action inbox |
| Agent memory (LangChain, Letta, Zep/Graphiti, Mem0, Karpathy wiki) | Long-term memory | Files (AGENTS.md, wiki), JSON stores, vectors, a temporal graph | The agent, in the hot path or in the background | n/a |

## What the Humanoid takes

**Event ledger (from Celonis and OCEL 2.0)**
- Every event: one `type`, one timestamp, and a list of
  `(object_id, qualifier)` links (`requester`, `subject`, `assignee`).
- Object types with ids stable across connectors: one customer is one object
  whether it arrives from email, billing or chat.
- Object-to-object links outside events (ticket `belongs-to` customer), so
  routing can walk the graph.
- Attribute changes kept as time-stamped values, apart from events; only real
  activities are events.
- Route by object, not by channel.

**Actions (from Palantir and Databricks)**
- Every connector action is typed: a parameter schema and submission
  criteria on the caller and the parameters, not only on the action name.
- Writeback first: the outside call succeeds before internal state changes;
  notifications are side effects.
- The action log is data: every action an agent takes is an event linked to
  the objects it touched ("what changed, by whom, and when" is a query).
- Per action: run automatically, or after a person confirms. Approvals exist.
- Every action runs under the caller's own permissions (on-behalf-of).

**Catalog (from Databricks)**
- One catalog for data, tools, MCP servers, agents and skills, with lineage:
  an action traces back to the events that caused it.
- A term is defined once and reused (a glossary in the wiki).

**Orchestration (from RPA)**
- One control plane sends each step to an agent, a deterministic script or a
  person, with deadlines and escalation (the board's tasks).
- Credentials the model never sees.
- Session replay and an exportable audit trail for every governed action.
- Where it differs: the Humanoid writes its own scripts, triggers and process
  model from events; nobody draws the process first. APIs and connector
  actions first, the browser as the fallback.

**Memory (from Graphiti, LangChain, Anthropic, Karpathy)**
- Validity per claim, not per page: `sources`, `valid_from`, `valid_to`,
  `superseded_by` (the event that replaced it). Old claims are invalidated,
  never deleted.
- Wiki writes are the injection path (episodes hold tool output and web
  content, and `index.md` reaches every session): one background writer with
  no other tools consolidates the ledger into the wiki; lint flags
  instructions inside semantic pages.
- `index.md` has a size cap; search (keyword, then hybrid) before the wiki
  passes a few hundred pages.
- One consolidator per workspace, reading the ledger since its last run:
  never two writers on one page.
- Lint skills too: near-duplicates, and rules about one case instead of a
  general rule.

## What it does not take

Data pipelines and an object store built by hand, ERP-scale SQL mapping,
batch extraction, a modeled process before the first run, a separate task
inbox for approvals, a schema designed by engineers per customer. The
Humanoid is the forward deployed engineer: it builds the model while it works.
