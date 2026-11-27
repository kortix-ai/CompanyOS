-- Migration: humanoid_workspace_twin_fks
--
-- SAFETY HEADER (house rules -- see packages/db/MIGRATIONS.md#zero-downtime-rules).
set lock_timeout = '2s';
set statement_timeout = '30s';

-- 20261127134523104_humanoid_identity_and_events added two tables with a
-- foreign key into projects(project_id) and no workspace twin. Every such key
-- has a NO ACTION, deferred twin into workspaces(workspace_id), named
-- `<table>_project_id_workspaces_fk`
-- (packages/db/scripts/workspaces-twin-foreign-keys.integration.test.ts).
-- Both tables are empty: no code reads or writes them since #13192 took the
-- humanoid off dev. Each ADD takes a brief SHARE ROW EXCLUSIVE lock on
-- workspaces (bounded by lock_timeout), and each VALIDATE scans an empty table.
ALTER TABLE kortix.humanoid_events ADD CONSTRAINT humanoid_events_project_id_workspaces_fk
  FOREIGN KEY (project_id) REFERENCES kortix.workspaces(workspace_id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
-- Safe: humanoid_events is empty; no code writes it.
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE kortix.humanoid_events VALIDATE CONSTRAINT humanoid_events_project_id_workspaces_fk;

ALTER TABLE kortix.humanoid_identities ADD CONSTRAINT humanoid_identities_project_id_workspaces_fk
  FOREIGN KEY (project_id) REFERENCES kortix.workspaces(workspace_id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID;
-- Safe: humanoid_identities is empty; no code writes it.
-- squawk-ignore constraint-missing-not-valid
ALTER TABLE kortix.humanoid_identities VALIDATE CONSTRAINT humanoid_identities_project_id_workspaces_fk;
