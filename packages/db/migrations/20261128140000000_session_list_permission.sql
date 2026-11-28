-- Inventory enumeration is independent of transcript reads and session writes.
-- Existing roles receive no new permission. Agents must explicitly declare it.
-- backfill-safe: kortix.permissions, exactly one catalog row; no DDL or table lock, no application data scan.
set lock_timeout = '2s';
set statement_timeout = '30s';
INSERT INTO kortix.permissions
  (action, scope_type, resource_type, delegable, description, area, level, implies)
VALUES ('project.session.list', 'project', 'project', true,
  'Enumerate session inventory in this workspace without granting transcript access or mutation.',
  'sessions', 'view', '{}'::text[])
ON CONFLICT (action) DO NOTHING;
