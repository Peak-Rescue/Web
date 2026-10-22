-- Pending stops meaning anything when every row on the shelf is being read
-- anyway. It said "an admin has not looked at this yet", and the answer to
-- that is now "nobody has looked at any of them yet, that is what this month
-- is" — so the badge marked the 68 rows that arrived most recently rather
-- than the ones needing work.
--
-- What it cost was real: a pending row is invisible to instructors and is
-- offered to no course, so material nobody had got to was material nobody
-- could use. The sorting marks and the empty type are what say a row needs
-- work, and they say it on every shelf.
--
-- The column stays — archived still means something — but nothing is pending
-- any more, and nothing in the app writes that state.
update library_items
set status = 'published', reviewed_at = coalesce(reviewed_at, now())
where status = 'pending';
