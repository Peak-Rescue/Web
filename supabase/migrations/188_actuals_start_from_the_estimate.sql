-- The actuals start as a copy of the estimate.
--
-- Reconciling a course meant retyping a list somebody had already typed
-- upstairs: the COA says lodging, a vehicle, flights and food, and the
-- actuals began empty every time. So the first time anybody opens the
-- actuals on a course that has a COA, its lines are written in as ordinary
-- cost lines at cost (no margin — margin is what we keep, not what we spend)
-- and the pay suggestion is written in beside them at the rates we actually
-- pay, not the padded ones we quote at.
--
-- They arrive as a guess to correct, and every one of them can be deleted.
-- Which is exactly why this column exists: once a course has been seeded it
-- is never seeded again, or a line somebody deliberately deleted would come
-- back the next time the page was opened.
alter table public.course_actuals
  add column if not exists seeded_at timestamptz;

comment on column public.course_actuals.seeded_at is
  'When the estimate was copied in as a starting point. Set once, whatever the reader then does with the lines — a deleted line must stay deleted.';
