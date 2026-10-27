-- Rappel Maui is somewhere a Maui day happens, not an area a course is sold
-- in — it shares Maui's weather and rescue plan. 272 made it a venue of its
-- own; the site and its meetup move under Maui and the venue goes.
update sites
   set venue_id = (select id from venues where name = 'Maui' and region_code = 'US-HI')
 where name = 'Rappel Maui'
   and venue_id = (select id from venues where name = 'Rappel Maui');

update meeting_points
   set venue_id = (select id from venues where name = 'Maui' and region_code = 'US-HI')
 where name = 'Garden of Eden Arboretum entrance'
   and venue_id = (select id from venues where name = 'Rappel Maui');

-- Only once nothing is left on it.
delete from venues v
 where v.name = 'Rappel Maui'
   and not exists (select 1 from sites where venue_id = v.id)
   and not exists (select 1 from meeting_points where venue_id = v.id)
   and not exists (select 1 from course_instances where venue_id = v.id)
   and not exists (select 1 from library_items where venue_id = v.id)
   and not exists (select 1 from contact_links where venue_id = v.id);
