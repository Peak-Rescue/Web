-- A custom booking can be a job: work we are hired to do rather than a course
-- we teach. Standby rescue and TV rigging are jobs by their offering
-- (JOB_OFFERINGS in lib/courses.ts); a custom booking has no offering to read
-- that off, so it says so here, once, when it is made.
--
-- Read only on a custom booking. A typed course is whatever its offering is,
-- so a row retyped in Details stops being a job without anybody clearing this.
--
-- Expand only: the default is what every existing row already is, so this is
-- safe in front of any build.

alter table course_instances
  add column if not exists job boolean not null default false;

comment on column course_instances.job is
  'A custom booking that is a job (no students, curriculum or gear list) rather than a course. Ignored unless course_type = ''custom''.';
