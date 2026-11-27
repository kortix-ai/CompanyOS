# The knowledge contract: procedural, episodic, semantic

Status: design (2026-11-27). Decisions in `decisions.md`.

One persistent contract for what a Humanoid (every workspace) knows, so any
agent, any session and any harness reads and writes it the same way.

## The three kinds

| Kind | What it holds | Where | Who writes | How it is read |
|---|---|---|---|---|
| Procedural | How to do things | Skills (`SKILL.md` folders) and AGENTS.md, in the workspace repo | Agents propose, review merges (change requests); the eval gate in `../continual-learning/` | Skill index hot, bodies on demand (exists) |
| Episodic | What happened, when, to what | The event ledger (`event-ledger.md`), append-only, plus session transcripts (`kortix.transcript.v1`) | The system writes every event; agents and sessions append episode records; nothing edits or deletes | By time, by link (object), by session tree; as read-only files |
| Semantic | What is true now | A wiki: markdown pages in the workspace's Files | Agents maintain it; the nightly sleep lints it | `index.md` hot, pages on demand |

## Episodic: the ledger is the memory

- Every event in the ledger is an episode. On top, the system appends
  episode records an agent did not have to write: a session's start and end,
  its outcome, what it changed (commits, connector writes from the call log),
  who it asked.
- Records never change. A correction is a new record that points at the old.
- Each record has `links` (the objects it is about) and a `parent`: the event
  that started the session, the session that started a subagent. The parent
  chain rebuilds the whole tree: event → session → subagents → tool calls,
  with the transcript as the leaf.
- Agents read it as a read-only folder (LangChain planned the same for Agent
  Builder: past conversations as files):

  ```
  /Memory/episodes/2026/11/27/<id>.md      one record, frontmatter + body
  /Memory/episodes/by-link/<link>/          every record about one object
  ```

  plus `search` by text, link, time and actor.

## Semantic: an ever-maintained wiki

The LLM-wiki pattern (Karpathy, 2026): sources are compiled once into pages
the agent keeps updated, instead of re-deriving answers from raw data on
every question.

```
/Memory/wiki/
  SCHEMA.md            the contract below, the agent's instructions
  index.md             one line per page; loaded at the start of every turn
  people/<slug>.md     a person: role, how they work, preferences
  orgs/<slug>.md       a customer, a vendor, a team
  systems/<slug>.md    an app, a database, an API, where it lives, who owns it
  processes/<slug>.md  how a piece of work flows, step by step
  decisions/<date>-<slug>.md
  topics/<slug>.md
```

Every page starts with frontmatter:

```yaml
title: …
type: person | org | system | process | decision | topic
links: [customer:…, system:…]   # the same object ids the ledger uses
sources: [ep_…, ep_…]           # the episodes each claim comes from
updated: 2026-11-27
```

- A claim without a source is not written. The sources point back into
  episodic memory, so every fact can be traced to what happened.
- The nightly sleep lints the wiki: contradictions, claims older than their
  newest source, orphan pages, the index out of date.
- `kortix_memory` (one fact per page about the person, in Files) becomes the
  `people/` part of this wiki for the Humanoid.

## Storage

- Episodic in the database (the ledger), mirrored read-only as files.
- Semantic in Files (a Platinum volume underneath: every write is a version,
  any old version restorable), not git: pages change many times a day.
- Procedural in git, as today: reviewed, versioned, shipped by commit.

## An ontology without a schema up front

Palantir's Foundry Ontology models a company as object types, link types,
action types and functions, built by forward deployed engineers before the
first app. The Humanoid reaches the same thing by building it as it works:

| Ontology element | Kortix piece |
|---|---|
| Objects and properties | Wiki pages (`type`, frontmatter, body) |
| Links | `links` on ledger events and pages (shared object ids) |
| Actions | Connector actions, governed by the gateway (rules, approvals, call log) |
| Functions | Skills and Apps code |

A typed object store (queries over thousands of objects) comes only when a
workspace needs it, for example as App data.
