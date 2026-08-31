-- The course photo album, owned by Peak Rescue instead of by whoever shot it.
--
-- Today an album is a pasted link (111), and in practice it points at an
-- instructor's personal Google Photos: the org can't audit it, can't recover
-- it, and loses it entirely the day that person deletes the album or moves on.
-- Google offers no way out of that — the Photos API dropped album sharing in
-- March 2025 and never supported service accounts, and Photos content can't be
-- transferred when a Workspace user is deleted. So the album moves to Drive,
-- in a Shared Drive the organisation owns, created and reached through the
-- portal.
--
-- Deliberately NOT a new table. A course's photo album is the thing that
-- already exists in course_links; this only records that one particular row is
-- a folder we manage rather than a link someone pasted. Everything else about
-- it — the label, the student-facing audience toggle, where it renders — keeps
-- working exactly as it did, and courses that keep using a pasted album carry
-- on unchanged.
alter table public.course_links
  add column if not exists drive_folder_id text;

comment on column public.course_links.drive_folder_id is
  'Google Drive folder id when the portal created and manages this album; null for a link someone pasted. Set means the portal may upload into it and render its contents.';

-- One managed folder per course. This is also the lock: the folder is created
-- lazily by the first upload, so two people uploading at the same moment on a
-- course that has no folder yet would otherwise make two. Whoever loses this
-- index trashes the folder it just created and uses the winner's.
create unique index if not exists course_links_one_drive_folder
  on public.course_links (instance_id)
  where drive_folder_id is not null;

-- Who added which photo.
--
-- Drive cannot answer this: every file is uploaded by the service account
-- acting as info@, so Drive's own "owner" is the same name on all of them.
-- Today it puts a name under an enlarged photo. It is also the only record
-- that a photo came from a particular person, so it is what a later "undo your
-- own upload" would have to be built on — removal is staff-only for now.
--
-- Drive stays the source of truth for what the album contains — the gallery
-- lists the folder and joins this on, so photos dropped straight into Drive by
-- an instructor still show up, just without a name against them.
create table if not exists public.course_photos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  instance_id   uuid not null references public.course_instances on delete cascade,
  drive_file_id text not null,
  uploaded_by   uuid references public.profiles on delete set null
);

-- The same Drive file recorded twice would double it in the gallery join.
create unique index if not exists course_photos_file
  on public.course_photos (drive_file_id);

create index if not exists course_photos_instance
  on public.course_photos (instance_id, created_at desc);

alter table public.course_photos enable row level security;

-- No policy, and no grant to authenticated: every read and write goes through
-- the service role in a server action, which applies the album's audience
-- itself. A student's access to a course is a portal fact, not a table fact,
-- and this table has nothing an authenticated client needs directly.
