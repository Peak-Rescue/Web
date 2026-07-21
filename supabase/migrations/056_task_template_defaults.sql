-- Split task templates like the pricing rates: default lines auto-seed every
-- new course; the rest are situational suggestions offered in a dropdown
-- (permits, aviation, winter kit…).

alter table public.course_task_templates
  add column if not exists default_line boolean not null default true;

update public.course_task_templates
  set default_line = false
  where title in (
    'Permits secured',
    'Private land coordination',
    'Aviation assets coordinated',
    'Lift tickets purchased',
    'Snow machines arranged',
    'Rental gear for clients arranged'
  );
