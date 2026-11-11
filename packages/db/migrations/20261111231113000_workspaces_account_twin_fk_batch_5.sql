-- Migration: workspaces_account_twin_fk_batch_5
--
-- Workspaces Release 2a step 4, account side (design: .agents/skills/learnings/work/workspaces/design.md
-- §4). Each foreign key into kortix.accounts(account_id) gets a twin into
-- kortix.workspaces(legacy_account_id), backed by uq_workspaces_legacy_account
-- (20261111231000000, which refuses to build while an account is split_pending).
-- kortix.projects.account_id is left out: it is the old store's own key.
--
-- Tables (the old foreign key, its ON DELETE):
--   project_spaces.account_id  (project_spaces_account_id_accounts_account_id_fk, ON DELETE CASCADE)
--   provider_transitions.account_id  (provider_transitions_account_id_accounts_account_id_fk, ON DELETE CASCADE)
--   review_items.account_id  (review_items_account_id_accounts_account_id_fk, ON DELETE CASCADE)
--   role_assignments.account_id  (role_assignments_account_id_accounts_account_id_fk, ON DELETE CASCADE)
--   roles.account_id  (iam_roles_account_id_accounts_account_id_fk, ON DELETE CASCADE)
--   sandbox_templates.account_id  (sandbox_templates_account_id_fkey, ON DELETE CASCADE)
--   scim_tokens.account_id  (scim_tokens_account_id_fkey, ON DELETE CASCADE)
--   service_accounts.account_id  (service_accounts_account_id_fkey, ON DELETE CASCADE)
--
-- NO ACTION, DEFERRABLE INITIALLY DEFERRED, NOT VALID (design.md §4 step 4, amended 2026-11-11).
-- Inside a normal write the R1 reconcile deletes or clears the row that holds an account's
-- legacy_account_id: the project-less row the first project replaces, and the source row a
-- transfer tombstones until the dormant row is upserted. A CASCADE twin would delete every
-- account-keyed row there; a non-deferred one would refuse the transfer. The deferred check
-- runs at commit, when the replacement row exists. The old key keeps the ON DELETE action;
-- Release 2b re-creates each twin with it and validates once.
--
-- Locks: SHARE ROW EXCLUSIVE on the child and on kortix.workspaces for the catalog change
-- only. lock_timeout 3s: a 55P03 rolls this file back; find the holder in pg_stat_activity
-- and rerun, never raise the timeout. Cold tables: up to 8 per file.
--
-- Mixed-version deploy: the R1 image never names kortix.workspaces; its triggers keep one row
-- per account holding legacy_account_id (0 split_pending is this release's gate).
--
-- ROLL BACK: a forward migration with ALTER TABLE ... DROP CONSTRAINT IF EXISTS <name> for
-- each twin below.
set lock_timeout = '3s';
set statement_timeout = '30s';

ALTER TABLE kortix.project_spaces
  ADD CONSTRAINT project_spaces_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.provider_transitions
  ADD CONSTRAINT provider_transitions_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.review_items
  ADD CONSTRAINT review_items_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.role_assignments
  ADD CONSTRAINT role_assignments_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.roles
  ADD CONSTRAINT roles_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.sandbox_templates
  ADD CONSTRAINT sandbox_templates_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.scim_tokens
  ADD CONSTRAINT scim_tokens_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.service_accounts
  ADD CONSTRAINT service_accounts_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
