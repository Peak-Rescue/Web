drop table if exists instructor_capabilities;
drop type if exists capability_category;
drop type if exists capability_role;

create table instructor_capabilities (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references profiles on delete cascade,
  category      text not null,
  role          text not null check (role in ('lead', 'assist')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(instructor_id, category)
);

alter table instructor_capabilities enable row level security;

create policy "capabilities: instructors read own"
  on instructor_capabilities for select
  using (instructor_id = auth.uid());
