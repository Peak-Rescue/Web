-- Who added a course, kept apart from who owns it.
--
-- owner_id starts as the creator but is one dropdown from being somebody
-- else, so it cannot answer "who put this on the books". This can, and
-- nothing changes it after the insert.
--
-- Not backfilled: for an existing course the owner is only a guess at the
-- creator, and a guess written into this column would read as a fact.
alter table public.course_instances
  add column created_by uuid references public.profiles on delete set null;
