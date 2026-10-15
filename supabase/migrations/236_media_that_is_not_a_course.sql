-- Photos and video that belong to no course, and tags on the ones that do.
--
-- What gets shot on a course already has a home: a Drive folder per course and
-- a row here saying who took it. What has never had a home is the general
-- stuff — a rigging sequence shot deliberately, stock photography for a
-- proposal, a video made for no delivery in particular — because instance_id
-- was NOT NULL and there was no course to point it at.
--
-- Same shape as 232 gave tasks: a null instance means general. The album is
-- then browsed the way everything here is, by the course it came from, with
-- the general ones as their own album at the end.
alter table public.course_photos alter column instance_id drop not null;

create index if not exists course_photos_general_idx
  on public.course_photos (created_at desc) where instance_id is null;

-- Tags of its own.
--
-- What came off a course needs none: the course already says it was canyon
-- work on Maui in March, and that is inherited at read time rather than copied
-- here, so re-typing a course re-tags its photos and nothing drifts. These are
-- for the general ones, which have no course to inherit from — and as an
-- override on a course photo that is about something other than its course.
--
-- Set per upload, not per photo. Tagging forty photos one at a time is the job
-- that does not get done; tagging the drop takes one go.
alter table public.course_photos
  add column if not exists disciplines text[] not null default '{}',
  add column if not exists topics      text[] not null default '{}',
  add column if not exists caption     text;

-- Where the general ones live in Drive. One row, created by the first upload,
-- for the same reason a course's folder is: an empty folder nobody asked for
-- is worse than a folder that appears when it is needed.
create table if not exists public.media_folders (
  slug            text primary key,
  drive_folder_id text not null,
  created_at      timestamptz not null default now()
);

alter table public.media_folders enable row level security;
-- No policy and no grant, like course_photos: every read and write goes
-- through the service role in a server action.
