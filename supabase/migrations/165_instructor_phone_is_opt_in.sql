-- An instructor's phone number is theirs, not the course's.
--
-- The crew card on a course page now carries a way to reach the people
-- running it, which is the thing a student wants at a trailhead. A work email
-- can be worked out — anything at peak-rescue.com is a work address and
-- anything else is somebody's personal one — but a phone number cannot: every
-- number we hold is a personal mobile, and the only way to know whether it may
-- be handed to eight students is to have been asked.
--
-- So it is opt-in, per instructor, defaulting to hidden. Adding the column
-- before the code that reads it means a deploy in either order is safe: until
-- the app ships, nothing looks at this; once it ships, everyone starts hidden.
alter table public.instructors
  add column if not exists show_phone boolean not null default false;

comment on column public.instructors.show_phone is
  'Whether this instructor''s phone may be shown to students on a course page. Off unless they have said yes.';

-- The people who have said yes. Matched on email rather than name: a name gets
-- corrected, and two of these are Erics.
update public.instructors
   set show_phone = true
 where lower(email) in (
   'micah@peak-rescue.com',
   'eric@peak-rescue.com',
   'toph@peak-rescue.com',
   'nadav@peak-rescue.com',
   'codycarroll@peak-rescue.com'
 );
