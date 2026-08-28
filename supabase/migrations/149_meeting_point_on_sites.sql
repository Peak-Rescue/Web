-- Where we meet is a fact about the canyon, not about day 3.
--
-- One meetup for Emerald Upper, another for Emerald Lower, another for
-- Knucklehead — decided by which place we are going into, and the same answer
-- every time we go there. Held on the course it was retyped per delivery and
-- overwritten every evening: setting Wednesday's plan destroyed Tuesday's,
-- because the course carries exactly one meeting_point and one meeting_time.
--
-- So it moves to the site, on the same terms as the beta above it: written
-- once, shown live on every schedule day pointing there, and corrected in one
-- place for every course at once. 147 already said half of this out loud —
-- the site's links are commented there as "the same three links this kind of
-- day already carries on the course's meeting point".
alter table public.sites
  add column if not exists meeting_point text,
  -- The hour is weaker than the place. A two-hour approach is a fact about
  -- Emerald and belongs here, but daylight, tides, the group and what we are
  -- doing that day all move it — so this is the usual answer, offered to the
  -- day rather than announced from here. What goes out is always the day's.
  add column if not exists usual_meeting_time text;

comment on column public.sites.meeting_point is
  'Where we meet for this place, in prose. Shown on every schedule day pointing here, and overridable per day.';
comment on column public.sites.usual_meeting_time is
  'The hour we usually meet here — a starting value for a day, never the announced one.';

-- coords has been stored and editable since 147 and rendered nowhere, so
-- nothing depends on what it used to mean. It means the meeting pin.
comment on column public.sites.coords is
  'Coordinates of the meeting point — the pin you drive to, not the middle of the canyon.';

-- What is true of one day only.
--
-- The place is inherited and rarely typed: the exception is the shuttle
-- morning, or meeting at the shop first. The hour is typed nearly every time,
-- because it is the half that moves. The note is the day-of sentence that used
-- to go out as an update and had nowhere to live afterwards.
--
-- Named to match course_instances, which carries the same three facts for a
-- course with no schedule at all — that row stays as the floor, and the read
-- order is: the day, then its site, then the course.
alter table public.schedule_days
  add column if not exists meeting_point text,
  add column if not exists meeting_time  text,
  add column if not exists meeting_note  text;

comment on column public.schedule_days.meeting_point is
  'Overrides the site''s meeting point for this day only. Null means the site''s.';
comment on column public.schedule_days.meeting_time is
  'The hour announced for this day. Seeded from the site''s usual time, never inherited silently.';
comment on column public.schedule_days.meeting_note is
  'What is true of this morning only — the shuttle, the gate code, who is driving.';

-- Deliberately NOT added to the template copy in copyDaysInto(): a schedule
-- saved to the shelf carries site_id, so the meeting point travels as
-- inheritance and stays correct. A copied hour would be last year's answer
-- wearing this year's date.
