-- An instructor listed under a work address who signs in with a personal one
-- matches nothing, so nothing links them and nothing promotes their role: they
-- land on the student empty state, and on the instructors page they look
-- identical to somebody who simply has not accepted their invite yet.
--
-- Two people are already in that shape (Brent Roth, Kevin Carey) and were only
-- linked by hand. Rather than make everyone keep one address, a record can now
-- carry the other ones they might sign in with.
--
-- Recognition only. `email` stays the single address we SEND to — invites,
-- course alerts, calendar invites, staffing requests all read it, and they
-- should keep reading only it. Mail going to two addresses because somebody
-- added a second one here is the failure this column must not cause.

alter table instructors
  add column sign_in_emails text[] not null default '{}';

comment on column instructors.sign_in_emails is
  'Other addresses this person may sign in with. Matched at sign-in to link and promote their account. Never a delivery address — send to instructors.email.';

-- The two we know about, taken from the account each is actually linked to.
update instructors i
set sign_in_emails = array[lower(p.email)]
from profiles p
where p.id = i.profile_id
  and i.email is not null
  and p.email is not null
  and lower(p.email) <> lower(i.email);
