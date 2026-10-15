-- Tasks that belong to no course: "renew the insurance", "service the rope
-- bag". A null instance_id is a general task. Only admins create and assign
-- them; the assignee works them like any other (tick, notes, attachments).
--
-- Expand-only: loosening the column breaks nothing the running build does,
-- and no null rows exist until the build that writes them ships.

alter table public.course_tasks alter column instance_id drop not null;

create index if not exists course_tasks_general_idx
  on public.course_tasks (created_at) where instance_id is null;
