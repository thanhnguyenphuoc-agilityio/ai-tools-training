-- users.name_custom: 1 when the person set the account name, 0 when it follows the sign-in name
ALTER TABLE users ADD COLUMN name_custom INTEGER NOT NULL DEFAULT 0;
