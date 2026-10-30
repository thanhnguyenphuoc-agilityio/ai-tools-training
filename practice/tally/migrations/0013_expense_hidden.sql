-- delete_settled_expense: a paid-toward expense can be hidden from the expense list by its author or the owner.
-- Hidden expenses still count in balances, suggestions and the export. NULL means visible.
ALTER TABLE expenses ADD COLUMN hidden_at TEXT;
ALTER TABLE expenses ADD COLUMN hidden_by TEXT;
