-- What was sent to a course, and when.
--
-- The dot on a door means "something you have not seen is behind this". The
-- question that settles is which changes count, and the answer is: the ones
-- somebody sent mail about. Not every edit — fix a typo in a gear list at
-- eleven at night and nothing should light up, and nobody should be told
-- their students have not read it. A push is a deliberate act with a
-- recipient list; an edit is not.
--
-- That choice is also what keeps this cheap. Detecting edits would mean
-- updated_at and a touch trigger on schedule_days, schedule_blocks,
-- gear_list_entries and instance_instructors, none of which carry timestamps
-- at all. Detecting pushes means writing one row where the mail already goes
-- out, and the content tables stay as they are.
--
-- One row per send, kept rather than overwritten: a course that announces its
-- morning three days running pushed three times, and someone who last looked
-- on the first of them is behind on all three.
create table if not exists public.course_pushes (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.course_instances on delete cascade,
  -- Which door it is behind, as the course page groups them: 'schedule' for a
  -- meeting point, 'updates' for a post. Stored rather than derived, because
  -- the grouping is a decision the page makes and this is a record of what
  -- was true when the mail went.
  section     text not null,
  -- Who it went to, in the same words an update uses: everyone, students,
  -- instructors. A student gets no dot for a crew-only notice.
  audience    text not null default 'everyone',
  -- Your own send is not news to you.
  pushed_by   uuid references public.profiles on delete set null,
  pushed_at   timestamptz not null default now()
);

create index if not exists course_pushes_instance_idx
  on public.course_pushes (instance_id, pushed_at desc);

alter table public.course_pushes enable row level security;

-- No policy, and no grant. The course page reads this with the service role
-- alongside everything else it reads, and only the server writes it — there is
-- no browser path that should be able to say a thing was announced.
