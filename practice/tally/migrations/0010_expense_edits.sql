-- edit_expense: the time of the last edit. NULL means the expense was never edited.
ALTER TABLE expenses ADD COLUMN edited_at TEXT;
