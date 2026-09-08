-- The headcount a gear list is counted against.
--
-- Every quantity on a list is worked out at read time from the course's
-- max_students, which is right nearly always: the roster moves and the whole
-- list moves with it. But the list is also packed against a number somebody
-- decided, and the two are not always the same. A course capped at twelve that
-- has eight signed up is packed for eight; a course that is taking two extra
-- at the door is packed for fourteen. Today the only way to say either is to
-- type over every row, which loses the rule that made the list worth having.
--
-- So the list may carry its own headcount. Null — which is every list that
-- exists today — means "follow the course", and nothing changes for it.
--
-- Additive, and read by nothing until the code that uses it deploys, so the
-- order these two go out in does not matter. Removing it later would be the
-- other kind of change.
alter table public.gear_lists
  add column if not exists students integer;

comment on column public.gear_lists.students is
  'Headcount this list is packed for. Null follows the course''s max_students.';

-- A list packed for nobody is a list with no quantities on it, which is a
-- worse answer than following the course.
alter table public.gear_lists
  drop constraint if exists gear_lists_students_positive;
alter table public.gear_lists
  add constraint gear_lists_students_positive
  check (students is null or students > 0);
