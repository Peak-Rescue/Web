-- An instructor can say they are interested in a course from the calendar,
-- before anybody has asked. Same row as an answered invite — same token, same
-- response page, same staffing panel — marked so the panel can say who asked.
alter table public.course_interest_invites
  add column if not exists self_initiated boolean not null default false;

comment on column public.course_interest_invites.self_initiated is
  'True when the instructor raised it from the calendar rather than answering an emailed inquiry.';
