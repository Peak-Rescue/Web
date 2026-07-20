-- Track who put a task on someone's plate (created_by already records who
-- created the task; assigned_by records who made the current assignment).

alter table public.course_tasks
  add column if not exists assigned_by uuid references public.profiles on delete set null;
