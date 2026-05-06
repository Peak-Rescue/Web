-- Auto-incrementing reference number (PR-0001, PR-0002, …)
create sequence course_instance_ref_seq start 1;

alter table course_instances
  add column ref_number integer not null default nextval('course_instance_ref_seq'),
  add column slug       text unique;

-- Backfill ref_numbers for any existing rows (resets sequence to follow)
-- (no rows exist yet so this is a no-op, but kept for safety)
select setval('course_instance_ref_seq', coalesce(max(ref_number), 0) + 1, false)
  from course_instances;
