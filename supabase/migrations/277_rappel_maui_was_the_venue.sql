-- "Rappel Maui" was what the Maui venue was called for a while, so it was
-- typed onto days that were somewhere else. Day 2 of the August course and
-- of the wet-rescue template are at Emerald Canyon (Lower), which their site
-- already says; the typed words go, as 276 did for every other site day.
update schedule_days
   set location = null
 where id in ('66199b4d-41e5-41f5-98c5-d9dfb60cee6b', 'fcb4c344-bf9f-44fd-9176-9ef21698ec81')
   and location = 'Rappel Maui';

-- The map is of Maui, and is already filed to the venue.
update library_items
   set title = 'Maui (SARTopo)'
 where id = 'c53e4851-dd4a-4b64-b669-61d08812b904'
   and title = 'Maui — Rappel Maui';
