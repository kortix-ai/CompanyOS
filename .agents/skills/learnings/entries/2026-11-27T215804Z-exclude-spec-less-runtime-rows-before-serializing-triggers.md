---
recorded: 2026-11-27T21:58:04Z
incident_date: 2026-11-27
---
# Exclude spec-less runtime rows before serializing triggers

**Rule:** Select only object-valued `schedule_spec` rows when listing runtime triggers. SQL NULL and JSON null both mean there is no spec to serialize.

**Trigger surface:** Reading `project_trigger_runtime` for the combined trigger list.

**Incident:** 2026-11-27, prod. A spec-less runtime row reached `serializeSessionReminder` through the agent-trigger list and made GET /triggers/all return 500 (KRTX-5251).

**Enforcement:** `apps/api/src/__tests__/integration-runtime-triggers.test.ts` exercises both null forms beside valid current and legacy runtime prefixes. Flow TRG-41 asserts HTTP 200 and preservation of the valid loop.
