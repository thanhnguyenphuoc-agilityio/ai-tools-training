-- Tally schema v1. Amounts are integers in the group currency's minor units. Timestamps are ISO-8601 UTC strings.
-- Later features add their own numbered migrations; see docs/design.md.

CREATE TABLE groups (
  code              TEXT PRIMARY KEY,           -- "x7kq-m2pz-9hfw"
  name              TEXT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'VND', -- ISO 4217, see shared/currency.ts
  round_to          INTEGER NOT NULL DEFAULT 1, -- rounding unit in minor units
  owner_key_hash    TEXT NOT NULL,              -- sha256 hex of the owner key
  last_activity_at  TEXT NOT NULL,              -- tracked now, used by the retention feature
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_groups_activity ON groups(last_activity_at);

CREATE TABLE members (
  id            TEXT PRIMARY KEY,
  group_code    TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  bank_bin      TEXT,
  account_no    TEXT,
  account_name  TEXT,
  token_hash    TEXT,                           -- sha256 hex of the device token; NULL = not claimed yet
  is_owner      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_members_group ON members(group_code);

CREATE TABLE expenses (
  id           TEXT PRIMARY KEY,
  group_code   TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  payer_id     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  description  TEXT NOT NULL,
  spent_on     TEXT NOT NULL,                   -- YYYY-MM-DD
  split_mode   TEXT NOT NULL,                   -- 'equal' | 'weight'; validated in code (no CHECK, so new modes need no table rebuild)
  created_by   TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  deleted_at   TEXT,
  deleted_by   TEXT
);
CREATE INDEX idx_expenses_group ON expenses(group_code);

CREATE TABLE expense_shares (
  expense_id  TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  weight      REAL NOT NULL,
  amount      INTEGER NOT NULL,
  PRIMARY KEY (expense_id, member_id)
);

CREATE TABLE transfers (
  id            TEXT PRIMARY KEY,
  group_code    TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  from_id       TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_id         TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  status        TEXT NOT NULL,                  -- 'sent' | 'confirmed'; validated in code
  created_at    TEXT NOT NULL,
  confirmed_at  TEXT
);
CREATE INDEX idx_transfers_group ON transfers(group_code);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_code  TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  actor       TEXT NOT NULL,                    -- member id, "owner" or "anonymous"
  action      TEXT NOT NULL,
  target      TEXT,
  at          TEXT NOT NULL
);
