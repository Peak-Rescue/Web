-- Updates become editable, and can carry links.
--
-- The first version put the whole message in the email, which froze it: a
-- meeting point corrected an hour later left the wrong one sitting in twelve
-- inboxes, and nothing could be done about it. The email now says only that
-- there's an update and where to read it, so the portal is the single copy and
-- fixing it fixes what people see.
--
-- Links are subordinate to the update — always read with it, never queried on
-- their own, replaced wholesale when edited — so they're a json array rather
-- than a table, the same way course contacts are stored.

alter table public.course_updates
  add column if not exists links jsonb not null default '[]'::jsonb;

comment on column public.course_updates.links is
  'Array of {label, url} attached to this update. Validated in the server action.';

-- Uploaded files, same private task-documents bucket as course and task
-- attachments, signed at read time. Stored the same way as links and for the
-- same reason.
alter table public.course_updates
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.course_updates.attachments is
  'Array of {path, filename} in the task-documents bucket. Signed when read.';

-- Null until someone edits. Shown to readers, because an update that changed
-- after it was emailed should say so rather than quietly differ from the
-- notice that brought them here.
alter table public.course_updates
  add column if not exists updated_at timestamptz;

-- Each notification send, not just the first: a substantive correction can be
-- re-sent, and the row should say how many times and how it went.
alter table public.course_updates
  add column if not exists notify_count int not null default 0;
