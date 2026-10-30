-- leave_group: a member who left the group is marked, so the removed list shows "left the group" (no reason).
ALTER TABLE members ADD COLUMN left_group INTEGER NOT NULL DEFAULT 0;
