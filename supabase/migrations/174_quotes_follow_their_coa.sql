-- A quote exists because a COA did. Setting the COA aside without its quotes
-- leaves the numbers from a rejected option sitting at the top of the page,
-- so a quote follows the COA it was priced from: archived_at is set for it
-- when every COA it draws on has been set aside, and cleared when one comes
-- back. Options quotes draw on several, so they only go when the last one does.
alter table public.course_quotes
  add column if not exists archived_at timestamptz;
