-- The team's word for whoever is running the course is "primary", and there can
-- be more than one of them on a week.
--
-- Comments only. The column stays `in_charge`: it says what it means, and a
-- rename would buy nothing a comment cannot while costing a window where the
-- deployed code and the database disagree about what the column is called. This
-- is here so the next person reading the schema finds the word the crew
-- actually uses on it.
comment on column public.instance_instructors.in_charge is
  'Whether this person is a primary on the course — running it in the field. "Primary" is the team''s word for it and what every screen says. Any number of the crew can be one, and they need not be on lead wage. Separate from role, which is only what they are paid.';
