-- How long a course's costs are allowed to keep arriving before anybody is
-- asked to close its books.
--
-- The courses list nags to close the books once a course has run, because
-- "paid" and "our costs are final" are two different finishes and only the
-- second one is ours. It must not nag straight away: an expense report lands
-- weeks late and a card statement lands the month after, and closing early is
-- how a late charge ends up with nowhere to go.
--
-- Unlike every other row in this table, this one is NOT snapshotted onto a
-- course. It is a live display threshold — changing it from 30 to 45 has to
-- move every course at once, or changing it would only affect courses created
-- afterwards, which is useless.

insert into public.org_settings (key, value, label, unit, notes)
values (
  'books_settle_days',
  30,
  'Costs keep arriving for',
  'days after a course',
  'How long to wait after a course before the list asks anyone to close its books. Expense reports trickle in and card statements land the month after, so closing sooner is how a late charge ends up with nowhere to go. Applies live to every course, rather than being taken once like the numbers above it.'
)
on conflict (key) do nothing;
