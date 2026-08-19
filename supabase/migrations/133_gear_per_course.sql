-- Per course is a unit, not the absence of one.
--
-- 131 read these two columns as "a ratio to the students, or no rule at all",
-- and the editor offered that absence as a button labelled "fixed number". It
-- read as jargon sitting beside a number, because it was: a name for a state
-- rather than for what the row means. What the row means is one Sked for the
-- course, forty feet of webbing for the course — which is a unit, and a thing
-- you can say.
--
-- So the pair is now a number and what it is counted against:
--
--   qty_each = 1, qty_per_students = 1     one each
--   qty_each = 1, qty_per_students = 6     one between six
--   qty_each = 1, qty_per_students = null  one for the course
--   qty_each = null                        no rule; the row is what quantity says
--
-- Nothing moves in the data — the columns already held all four shapes, and the
-- constraint already allowed them. This says which is which, so the next person
-- to read the schema doesn't have to infer "per course" from an absence.

comment on column public.gear_list_entries.qty_each is
  'How many of this item per unit. Null is no rule at all: the row is however many quantity says, which is what "20 ft" and "sample of ladder types" need.';
comment on column public.gear_list_entries.qty_per_students is
  'What qty_each is counted against: 1 for one each, 6 for one between six, null for per course — a number the roster does not touch. Meaningless without qty_each, which is why the two are only ever written together.';
