-- A task can be on more than one person's plate. Shared, not split: any one
-- assignee ticking it closes it for all of them, so status stays on the task
-- and the people move to a join table.
--
-- Expand step. course_tasks.assigned_to/assigned_by stay for now because the
-- running build still reads and writes them; a trigger mirrors those writes
-- into the join table until that build is gone. The new build never sets
-- assigned_to (it nulls it whenever it changes a task's people), so the
-- trigger falls silent once it ships. A later migration drops the columns,
-- the trigger, and the assigned_to clauses in the read policies.

create table if not exists public.course_task_assignees (
  task_id     uuid not null references public.course_tasks on delete cascade,
  profile_id  uuid not null references public.profiles on delete cascade,
  -- Who put it on this person's plate. Per person, because people get added
  -- to a task at different times by different hands.
  assigned_by uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create index if not exists course_task_assignees_profile_idx
  on public.course_task_assignees (profile_id);

insert into public.course_task_assignees (task_id, profile_id, assigned_by)
select id, assigned_to, assigned_by from public.course_tasks
where assigned_to is not null
on conflict do nothing;

-- Who ticked it. With several people on a task, "done" without a name leaves
-- the others wondering which of them did it.
alter table public.course_tasks
  add column if not exists completed_by uuid references public.profiles on delete set null;

-- ─── Mirror the old build's single-assignee writes ──────────────────────────

create or replace function public.mirror_task_assigned_to()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assigned_to is not null and old.assigned_to <> new.assigned_to then
    delete from public.course_task_assignees
    where task_id = new.id and profile_id = old.assigned_to;
  end if;
  insert into public.course_task_assignees (task_id, profile_id, assigned_by)
  values (new.id, new.assigned_to, new.assigned_by)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists course_tasks_mirror_assigned_to on public.course_tasks;
create trigger course_tasks_mirror_assigned_to
  after insert or update of assigned_to on public.course_tasks
  for each row execute function public.mirror_task_assigned_to();

-- ─── RLS (writes go through the service role; this is a read backstop) ──────

alter table public.course_task_assignees enable row level security;

drop policy if exists "course_task_assignees: team read" on public.course_task_assignees;
create policy "course_task_assignees: team read"
  on public.course_task_assignees for select
  using (
    public.is_admin()
    or profile_id = auth.uid()
    or exists (
      select 1 from public.course_tasks t
      join public.instance_instructors ii on ii.instance_id = t.instance_id
      join public.instructors i on i.id = ii.instructor_id
      where t.id = course_task_assignees.task_id and i.profile_id = auth.uid()
    )
  );

drop policy if exists "course_tasks: team read" on public.course_tasks;
create policy "course_tasks: team read"
  on public.course_tasks for select
  using (
    public.is_admin()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.course_task_assignees a
      where a.task_id = course_tasks.id and a.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_tasks.instance_id and i.profile_id = auth.uid()
    )
  );

drop policy if exists "task_documents: team read" on public.course_task_documents;
create policy "task_documents: team read"
  on public.course_task_documents for select
  using (
    exists (
      select 1 from public.course_tasks t
      where t.id = task_id and (
        public.is_admin()
        or t.assigned_to = auth.uid()
        or exists (
          select 1 from public.course_task_assignees a
          where a.task_id = t.id and a.profile_id = auth.uid()
        )
        or exists (
          select 1 from public.instance_instructors ii
          join public.instructors i on i.id = ii.instructor_id
          where ii.instance_id = t.instance_id and i.profile_id = auth.uid()
        )
      )
    )
  );

grant select on public.course_task_assignees to authenticated;
