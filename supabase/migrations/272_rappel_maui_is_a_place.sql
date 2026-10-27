-- Rappel Maui was a word typed on Day 1 of the October Maui course, with the
-- food truck, the pin and the map link typed beside it — so the next course
-- there would have started from nothing. It becomes a venue, a site under it
-- for a day to point at, and a meetup that site uses by default.
do $$
declare
  v_id uuid;
  mp_id uuid;
  s_id uuid;
begin
  if exists (select 1 from venues where name = 'Rappel Maui') then
    return;
  end if;

  insert into venues (name, region, region_code)
  values ('Rappel Maui', 'Maui, HI', 'US-HI')
  returning id into v_id;

  insert into meeting_points (name, venue_id, directions, coords, links)
  values (
    'Garden of Eden Arboretum entrance',
    v_id,
    'By the food truck at the entrance to the Garden of Eden Arboretum.',
    '20.87057,-156.17998',
    '[{"url":"https://maps.app.goo.gl/1cwPxLLPxJ5UGSm67","label":"Google Maps"}]'::jsonb
  )
  returning id into mp_id;

  insert into sites (name, venue_id, meeting_point_id)
  values ('Rappel Maui', v_id, mp_id)
  returning id into s_id;

  -- Day 1 now points at the place, so its typed copy goes.
  update schedule_days
     set site_id = s_id,
         meeting_point = null,
         meeting_point_id = null,
         meeting_links = '[]'::jsonb
   where id = '4f47c90e-9470-4cab-92d4-a5766595c77c'
     and site_id is null;
end $$;
