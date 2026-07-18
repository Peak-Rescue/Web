-- Per-course task tracking: a checklist per course instance, assignable to
-- specific people, auto-populated from a standard template when an instance
-- is created. Admins and the instance's lead instructor manage tasks; the
-- assignee can mark their own done. Writes go through the service-role
-- client; RLS is a read backstop.

-- ─── Standard checklist templates ───────────────────────────────────────────

create table if not exists public.course_task_templates (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  title        text not null,
  -- null = applies to every course type; else a list of course_type slugs.
  course_types text[],
  sort_order   int not null default 0,
  active       boolean not null default true
);

insert into public.course_task_templates (title, sort_order)
values
  ('Send quote to client', 10),
  ('Contract / SOW signed', 20),
  ('Cost estimate drafted', 30),
  ('Training itinerary drafted', 40),
  ('Student gear list sent', 50),
  ('Gear order placed', 60),
  ('Course expendables stocked', 70),
  ('Student lodging booked', 80),
  ('Instructor lodging booked', 90),
  ('Rental vehicles reserved', 100),
  ('Permits secured', 110),
  ('Private land coordination', 120),
  ('Aviation assets coordinated', 130),
  ('Lift tickets purchased', 140),
  ('Snow machines arranged', 150),
  ('Rental gear for clients arranged', 160),
  ('Instructor payroll submitted', 170),
  ('Invoice sent / payment received', 180)
on conflict do nothing;

-- ─── Tasks ──────────────────────────────────────────────────────────────────

create table if not exists public.course_tasks (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  instance_id   uuid not null references public.course_instances on delete cascade,
  title         text not null,
  notes         text,
  assigned_to   uuid references public.profiles on delete set null,
  due_date      date,
  status        text not null default 'open' check (status in ('open', 'done')),
  completed_at  timestamptz,
  created_by    uuid references public.profiles on delete set null,
  sort_order    int not null default 0
);

create index if not exists course_tasks_instance_idx on public.course_tasks (instance_id);
create index if not exists course_tasks_assignee_idx on public.course_tasks (assigned_to) where status = 'open';

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.course_task_templates enable row level security;
alter table public.course_tasks enable row level security;

drop policy if exists "task_templates: authenticated read" on public.course_task_templates;
create policy "task_templates: authenticated read"
  on public.course_task_templates for select
  using (auth.uid() is not null);

-- Tasks: admins, the assignee, and instructors assigned to the instance.
drop policy if exists "course_tasks: team read" on public.course_tasks;
create policy "course_tasks: team read"
  on public.course_tasks for select
  using (
    public.is_admin()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.instance_instructors ii
      join public.instructors i on i.id = ii.instructor_id
      where ii.instance_id = course_tasks.instance_id and i.profile_id = auth.uid()
    )
  );

-- ─── Explicit grants (see 029_explicit_grants.sql) ──────────────────────────

grant select on public.course_task_templates to authenticated;
grant select, insert, update, delete on public.course_tasks to authenticated;
