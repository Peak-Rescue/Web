-- A course collects COAs as the conversation moves — the fly-in option, the
-- version before the client cut a day. Rejected ones are not wrong, they are
-- just no longer the plan, so deleting them loses the record of what was
-- offered. archived_at is the date one stopped being live: it drops out of
-- the comparison table, the quote price picker and the copy-to-a-new-course
-- sweep, and collapses to a one-line summary that can be brought back.
alter table public.course_estimates
  add column if not exists archived_at timestamptz;
