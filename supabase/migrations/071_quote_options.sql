-- Multi-option quotes: one quote can present every COA as a priced option
-- (e.g. "Drive team — $18,400" / "Fly-in — $24,100"). The client checks the
-- option or options they want when accepting; the chosen set is flagged in
-- place and the quote total becomes their sum.
--
-- options: jsonb array of { title, total, chosen? } snapshotted from the
-- COAs at creation (same snapshot semantics as the existing single total).
-- Null = classic single-total quote; nothing changes for those.

alter table public.course_quotes
  add column if not exists options jsonb;
