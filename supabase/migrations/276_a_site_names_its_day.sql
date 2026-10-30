-- A day at a site is named by the site. The typed location beside it was a
-- second answer to "where" — "Knucklehead" under Knucklehead Canyon, "Emerald
-- (upper)" under Emerald Canyon (Upper) — and the day card now only offers
-- the words for a place that is not a site.
--
-- Two days are left alone: Day 2 of the Maui course and its template point at
-- Emerald Canyon (Lower) and say "Rappel Maui", which is a different site, not
-- a restatement. Which one the day is at is a question for a person.
update schedule_days
   set location = null
 where site_id is not null
   and location is not null
   and id not in (
     '66199b4d-41e5-41f5-98c5-d9dfb60cee6b',
     'fcb4c344-bf9f-44fd-9176-9ef21698ec81'
   );
