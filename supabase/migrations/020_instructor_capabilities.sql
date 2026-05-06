-- Recreate instructor_capabilities, now referencing instructors(id) instead of profiles(id)

create table instructor_capabilities (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references instructors(id) on delete cascade,
  category      text not null,
  role          text not null check (role in ('lead', 'assist')),
  created_at    timestamptz not null default now(),
  unique(instructor_id, category)
);

alter table instructor_capabilities enable row level security;

create policy "capabilities: admin full access"
  on instructor_capabilities for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "capabilities: instructors read own"
  on instructor_capabilities for select
  using (
    exists (
      select 1 from instructors
      where id = instructor_capabilities.instructor_id
        and profile_id = auth.uid()
    )
  );
