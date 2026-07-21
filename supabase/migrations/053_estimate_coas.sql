-- Multiple cost estimates (COAs — courses of action) per course, e.g.
-- "3 instructors drive" vs "fly the team in". Each has its own line items
-- and margin; quotes are generated from a chosen COA.

alter table public.course_estimates
  drop constraint if exists course_estimates_instance_id_key;

alter table public.course_estimates
  add column if not exists title text not null default 'COA 1';

create index if not exists course_estimates_instance_idx
  on public.course_estimates (instance_id);
