-- Our own mark that a line is finished: right product, right link, sizes done.
-- Only a person knows that, so it is ticked rather than worked out. Never shown
-- to the team. Additive, and safe ahead of the code.
alter table public.gear_order_lines
  add column if not exists checked boolean not null default false;
