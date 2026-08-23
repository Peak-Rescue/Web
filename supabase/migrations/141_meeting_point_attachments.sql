-- The meeting point is prose, and prose can't hold a map pin.
--
-- "Garden of Eden Arboretum, wait at the entrance" is the plan; the dropped
-- pin is what a student actually navigates by at 0855. Pasting the URL into
-- the text left it unclickable, and hanging it off the announcement instead
-- buried it in the updates feed a day later — which is the one place nobody
-- looks when they are already driving.
--
-- Same shape as an update's links and attachments, so the same editor drives
-- both and a file lands in the same private bucket either way.
alter table public.course_instances
  add column if not exists meeting_links jsonb not null default '[]'::jsonb,
  add column if not exists meeting_attachments jsonb not null default '[]'::jsonb;

comment on column public.course_instances.meeting_links is
  'Links shown with the meeting point — a map pin, a gate-code page. [{label,url}]';
comment on column public.course_instances.meeting_attachments is
  'Files shown with the meeting point, in the task-documents bucket. [{path,filename}]';
