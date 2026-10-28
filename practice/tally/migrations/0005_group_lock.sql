-- lock_groups: exempt kept groups from inactivity purge
ALTER TABLE groups ADD COLUMN locked_at TEXT;
