-- google_sign_in: users, sessions, and linking groups and members to accounts

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  bank_bin TEXT,
  account_no TEXT,
  account_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);

ALTER TABLE members ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_members_group_user ON members(group_code, user_id) WHERE user_id IS NOT NULL;

ALTER TABLE groups ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_groups_owner_user ON groups(owner_user_id);
