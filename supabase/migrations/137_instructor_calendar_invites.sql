-- Whether an instructor is invited to the Google Calendar event for the
-- courses they're staffed on.
--
-- Admins subscribe to the course calendars themselves, so an invite puts the
-- same course on their calendar twice — once from the shared calendar, once
-- from their own accepted copy. They turn this off. Field instructors leave it
-- on: accepting is how the course reaches their calendar at all.
--
-- This only governs the calendar. Assignment, date-change, and cancellation
-- emails come from the portal and reach everyone either way.
alter table instructors
  add column calendar_invites boolean not null default true;
