-- receipt_photos: an optional receipt photo per expense. The image bytes live in R2 under r2_key; this row only
-- points at them. group_code lets a purge of a group find its rows; deleting an expense or a group cascades here.
CREATE TABLE expense_attachments (
  id            TEXT PRIMARY KEY,
  group_code    TEXT NOT NULL REFERENCES groups(code) ON DELETE CASCADE,
  expense_id    TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  r2_key        TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL
);
-- One photo per expense: a new upload replaces the row (and deletes the old object).
CREATE UNIQUE INDEX idx_expense_attachments_expense ON expense_attachments(expense_id);
CREATE INDEX idx_expense_attachments_group ON expense_attachments(group_code);
