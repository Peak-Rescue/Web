-- Replace single starts_at/ends_at with a child table supporting non-contiguous schedules

alter table course_instances
  drop column if exists starts_at,
  drop column if exists ends_at;

create table instance_date_ranges (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references course_instances on delete cascade,
  starts_at    date not null,
  ends_at      date not null,
  "order"      integer not null default 0,
  constraint valid_range check (ends_at >= starts_at)
);

alter table instance_date_ranges enable row level security;

create policy "date_ranges: admin full access"
  on instance_date_ranges for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "date_ranges: assigned instructors read"
  on instance_date_ranges for select
  using (
    exists (
      select 1 from instance_instructors
      where instance_id = instance_date_ranges.instance_id
        and instructor_id = auth.uid()
    )
  );

create policy "date_ranges: enrolled students read"
  on instance_date_ranges for select
  using (
    exists (
      select 1 from enrollments
      where instance_id = instance_date_ranges.instance_id
        and user_id = auth.uid()
    )
  );
