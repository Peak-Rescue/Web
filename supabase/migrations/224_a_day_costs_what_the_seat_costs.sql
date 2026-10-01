-- A lead day and a shadow day are not the same money.
--
-- The estimate has quoted one "Instructor field day/s" at $750 against the head
-- count, which was right while a crew was leads and assists at roughly one
-- price. It is not right now: we pay $50, $40 and $25 an hour for the three
-- seats, and 220 made the course say how many of each it runs. Billing a
-- trainee at a lead's rate is wrong in our favour, and quoting a lead at an
-- average is wrong in the client's.
--
-- So the seats get their own lines, each quoted at 1.5× what it pays — the ratio
-- the two existing own-time rates already use, and not a new idea: $750 against
-- a $500 lead day, $300 against a $200 travel day. Ten hours at $50, $40 and $25
-- gives $500, $400 and $250, and 1.5× gives $750, $600 and $375.
--
-- The plain "Instructor field day/s" stays, and stays a default line. It is what
-- a course with no crew plan is quoted on — twenty-three of them today — and its
-- unit is "per instructor per day", which the new ones are not. A course that has
-- said what it is made of seeds the three; a course that has not seeds the one.
-- Neither seeds both: the seeder picks, and a seat the course has none of is not
-- a line.

insert into public.pricing_rates (label, unit, rate, sort_order, active, default_line, own_time)
values
  ('Lead field day/s',   'per lead per day',   750, 11, true, true, true),
  ('Assist field day/s', 'per assist per day', 600, 12, true, true, true),
  ('Shadow field day/s', 'per shadow per day', 375, 13, true, true, true)
on conflict do nothing;

comment on column public.pricing_rates.own_time is
  'Whether this line is somebody on the team rather than money leaving. Quoted at a padded rate on purpose — 1.5× what the hour actually pays — and never seeded into a course''s costs, because what we pay comes from the hourly rates instead.';
