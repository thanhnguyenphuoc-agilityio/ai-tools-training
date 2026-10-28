-- Set last_activity_at of all existing groups to the migration time so no group is deleted by surprise.
UPDATE groups SET last_activity_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
