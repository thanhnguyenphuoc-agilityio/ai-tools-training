-- attendance_split: recurring sessions with the members present, and the session an expense belongs to.
CREATE TABLE group_sessions (
  id TEXT PRIMARY KEY,
  group_code TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  day TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_group_sessions_group_day ON group_sessions(group_code, day);

CREATE TABLE attendance (
  session_id TEXT NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, member_id)
);

ALTER TABLE expenses ADD COLUMN session_id TEXT REFERENCES group_sessions(id) ON DELETE SET NULL;
