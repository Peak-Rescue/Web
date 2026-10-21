-- The needs-sorting tag means "nobody has said what this is". 121 rows carry
-- it and a type: the automatic pass typed them by writing to the table
-- directly, where the code path that takes the tag off does not run.
--
-- So the badge was accusing rows that were already filed — Reference ·
-- Manual, tagged Aerial Evac, and still wearing the amber — and the only way
-- to clear one was to open it and press Save, which changed nothing.
--
-- Every path that sets a type from here clears the tag itself
-- (clearSortingMark, in app/admin/library/actions.ts). This is the backlog
-- that pre-dates them.
update library_items
set topics = array_remove(topics, 'needs-sorting'), updated_at = now()
where topics @> array['needs-sorting'] and kind <> 'reference';
