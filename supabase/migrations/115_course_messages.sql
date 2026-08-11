-- Group email to the people on a course.
--
-- The sibling of course_updates, and deliberately the opposite trade. An
-- update lives on the portal and the email only points at it, so it can be
-- corrected. A message *is* the email: the words go to the inbox, which is the
-- point when someone has to read it tonight and won't be logging in.
--
-- Frozen by nature, so it's kept as a record of what was actually sent rather
-- than something editable. "What did we tell them?" is a question that comes up
-- after a course, not during it.

create table if not exists public.course_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  instance_id uuid not null references public.course_instances on delete cascade,
  subject     text not null,
  body        text not null,
  -- Who it went to. Instructors are a real audience: "gear check moved to
  -- 0600" is a crew message, not a student one.
  audience    text not null default 'students'
                check (audience in ('students', 'instructors', 'everyone')),
  created_by  uuid references public.profiles on delete set null,
  -- Recorded as sent, with what actually happened to it.
  recipient_count int not null default 0,
  sent_count      int not null default 0,
  -- The addresses it reached, so the record answers "did Sam get this?"
  recipients  jsonb not null default '[]'::jsonb
);

create index if not exists course_messages_instance
  on public.course_messages (instance_id, created_at desc);

alter table public.course_messages enable row level security;

-- Staff only, both ways: this is the outbox, not something the recipients
-- browse. Students read the mail in their own inbox.
drop policy if exists "course_messages: staff read" on public.course_messages;
create policy "course_messages: staff read"
  on public.course_messages for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_messages.instance_id
        and i.profile_id = auth.uid()
    )
  );

grant select, insert, delete on public.course_messages to authenticated;
