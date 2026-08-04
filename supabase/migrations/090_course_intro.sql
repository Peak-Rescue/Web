-- Course introduction: the "what this course is and what to expect" prose that
-- four Classroom classes open with (Welcome to The Google Classroom).
--
-- Same reasoning as meeting point and schedule: written per delivery, not
-- reused, so it belongs on the course rather than in the library.

alter table public.course_instances
  add column if not exists intro text;

comment on column public.course_instances.intro is
  'Welcome / what to expect, shown to everyone on the course.';
