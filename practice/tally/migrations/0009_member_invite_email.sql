-- member_email_invite: an optional email an owner stores for an unclaimed member. It is never returned by the API;
-- it only drives the automatic link when that account signs in (NULL = no invite).
ALTER TABLE members ADD COLUMN invite_email TEXT;
