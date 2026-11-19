---
recorded: 2026-11-19T16:59:05Z
incident_date: 2026-11-19
---
# Resolve trigger capacity only from explicit policy and shared evidence

**Rule:** Re-evaluate an opted-in trigger’s intended model before fresh or reused dispatch. Require fresh project-shared capacity evidence; unknown is not exhaustion.

**Trigger surface:** A trigger starts or re-prompts an automated agent session.

**Incident:** 2026-11-19: static Claude trigger pins bypassed a factory-specific capacity resolver. Event-driven runs reached exhausted shared accounts.

**Enforcement:** apps/api/src/projects/lib/trigger-capacity.test.ts, trigger-capacity-runtime.test.ts and trigger-capacity-entry.test.ts cover exhaustion, restoration, shared-only scope and manifest/CRUD preservation.
