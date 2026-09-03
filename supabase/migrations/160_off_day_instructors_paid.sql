-- Whether a break is paid, asked when the break is designated.
--
-- A break was one thing until now: a day the course does not run. It is
-- really two, and only the estimate can tell them apart — the crew flies home
-- over the weekend and is off the clock, or they stay in the canyon and are
-- paid to sit there. Both skip a teaching day; only one comes off the
-- instructor day count in a quote.
--
-- Default unpaid, because that is what a break has meant here since it was
-- built: existing breaks keep the meaning they were entered with. The lodging
-- and the vehicle are unaffected either way — those are read off the calendar
-- span, breaks included, since nobody returns the truck over a weekend.
alter table instance_off_days
  add column if not exists instructors_paid boolean not null default false;

comment on column instance_off_days.instructors_paid is
  'Instructors are paid for this break — it comes off the teaching days but stays in the day count a client is quoted for.';
