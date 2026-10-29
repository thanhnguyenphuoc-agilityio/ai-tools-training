-- owner_link_binds_account: revoke the owner key of groups already owned by an account (the owner uses the account now).
UPDATE groups SET owner_key_hash = 'revoked' WHERE owner_user_id IS NOT NULL;
