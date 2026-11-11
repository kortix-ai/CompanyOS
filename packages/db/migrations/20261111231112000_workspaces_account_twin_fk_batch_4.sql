-- Migration: workspaces_account_twin_fk_batch_4
--
-- Workspaces Release 2a step 4, account side (design: .agents/skills/learnings/work/workspaces/design.md
-- §4). Each foreign key into kortix.accounts(account_id) gets a twin into
-- kortix.workspaces(legacy_account_id), backed by uq_workspaces_legacy_account
-- (20261111231000000, which refuses to build while an account is split_pending).
-- kortix.projects.account_id is left out: it is the old store's own key.
--
-- Tables (the old foreign key, its ON DELETE):
--   notifications.account_id  (notifications_account_fk, ON DELETE CASCADE)
--   oauth_clients.account_id  (oauth_clients_account_id_accounts_account_id_fk, ON DELETE CASCADE)
--   project_access_requests.account_id  (project_access_requests_account_id_fkey, ON DELETE CASCADE)
--   project_git_connections.account_id  (project_git_connections_account_id_fkey, ON DELETE CASCADE)
--   project_git_credentials.account_id  (project_git_credentials_account_id_fkey, ON DELETE CASCADE)
--   project_session_groups.account_id  (project_session_groups_account_id_accounts_account_id_fk, ON DELETE CASCADE)
--   project_session_public_shares.account_id  (project_session_public_shares_account_id_fkey, ON DELETE CASCADE)
--   project_snapshot_builds.account_id  (project_snapshot_builds_account_id_fkey, ON DELETE CASCADE)
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

ALTER TABLE kortix.notifications
  ADD CONSTRAINT notifications_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.oauth_clients
  ADD CONSTRAINT oauth_clients_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.project_access_requests
  ADD CONSTRAINT project_access_requests_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.project_git_connections
  ADD CONSTRAINT project_git_connections_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.project_git_credentials
  ADD CONSTRAINT project_git_credentials_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.project_session_groups
  ADD CONSTRAINT project_session_groups_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.project_session_public_shares
  ADD CONSTRAINT project_session_public_shares_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE kortix.project_snapshot_builds
  ADD CONSTRAINT project_snapshot_builds_account_id_ws_account_fk FOREIGN KEY (account_id)
  REFERENCES kortix.workspaces (legacy_account_id) DEFERRABLE INITIALLY DEFERRED NOT VALID;
