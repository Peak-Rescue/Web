-- 183 backfilled sign_in_emails from profiles.email, on the belief that it was
-- the address those two sign in with. It is not: profiles.email is the contact
-- field, free text, and nothing syncs it to auth. Both addresses it copied in
-- are not accounts at all — Brent and Kevin each sign in under exactly the
-- address already on their instructor record.
--
-- Clear it. The column stays: an instructor who genuinely holds a second
-- account is still worth recognizing, and that is a fact to be entered rather
-- than inferred from a contact field.

update instructors set sign_in_emails = '{}' where sign_in_emails <> '{}';
