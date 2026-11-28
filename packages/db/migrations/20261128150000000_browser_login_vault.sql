SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '25s';
-- Server-owned browser credentials. No client policies or client grants.
CREATE TABLE kortix.browser_login_handles (
 handle_hash text PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now(),
 idle_expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
 absolute_expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days',
 removed_at timestamptz
);
CREATE TABLE kortix.browser_login_slots (
 handle_hash text NOT NULL REFERENCES kortix.browser_login_handles ON DELETE CASCADE,
 slot text NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES auth.sessions ON DELETE CASCADE,
 credential text NOT NULL,
 expires_at timestamptz NOT NULL,
 revision bigint NOT NULL DEFAULT 1,
 removed_at timestamptz,
 revoke_pending boolean NOT NULL DEFAULT false,
 PRIMARY KEY(handle_hash,slot),
 UNIQUE(handle_hash,user_id)
);
CREATE TABLE kortix.browser_login_attempts (
 handle_hash text NOT NULL REFERENCES kortix.browser_login_handles ON DELETE CASCADE,
 attempt text NOT NULL,
 method text NOT NULL CHECK (method IN ('password','email','google')),
 secret text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
 consumed boolean NOT NULL DEFAULT false,
 candidate text,
 user_id uuid REFERENCES auth.users ON DELETE CASCADE,
 session_id uuid REFERENCES auth.sessions ON DELETE CASCADE,
 PRIMARY KEY(handle_hash,attempt)
);
ALTER TABLE kortix.browser_login_handles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kortix.browser_login_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE kortix.browser_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON kortix.browser_login_handles, kortix.browser_login_slots, kortix.browser_login_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON kortix.browser_login_handles, kortix.browser_login_slots, kortix.browser_login_attempts TO service_role;
