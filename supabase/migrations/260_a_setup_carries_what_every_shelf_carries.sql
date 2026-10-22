-- The last two columns the shared filing panel asks for and a course setup
-- could not answer: topic tags, and who may see it. The others arrived with
-- 256 and 258.
--
-- Audience is the same two rungs every other shelf has. A setup is the shape
-- of a course, and some of them — the instructor development ones — are not
-- a shape students should be reading.
alter table public.course_templates
  add column if not exists topics text[] not null default '{}',
  add column if not exists audience text not null default 'shared'
    check (audience in ('internal', 'shared'));
