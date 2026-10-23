-- remove_member: a removed member stays in the history of expenses and transfers (soft delete).
ALTER TABLE members ADD COLUMN removed_at TEXT;
ALTER TABLE members ADD COLUMN removed_reason TEXT;
