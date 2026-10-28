-- feat: audit details column. details is JSON text explaining an entry; NULL for entries that record only their target.
ALTER TABLE audit_log ADD COLUMN details TEXT;
