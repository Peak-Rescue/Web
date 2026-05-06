-- Replace manual date blocks with overall window + off days

drop table if exists instance_date_ranges;

alter table course_instances
  add column starts_at date,
  add column ends_at   date;

create table instance_off_days (
  id           uuid primary key default gen_random_uuid(),
  instance_id  uuid not null references course_instances on delete cascade,
  off_date     date not null,
  unique (instance_id, off_date)
);

alter table instance_off_days enable row level security;

create policy "off_days: admin full access"
  on instance_off_days for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "off_days: assigned instructors read"
  on instance_off_days for select
  using (
    exists (
      select 1 from instance_instructors
      where instance_id = instance_off_days.instance_id
        and instructor_id = auth.uid()
    )
  );

create policy "off_days: enrolled students read"
  on instance_off_days for select
  using (
    exists (
      select 1 from enrollments
      where instance_id = instance_off_days.instance_id
        and user_id = auth.uid()
    )
  );
