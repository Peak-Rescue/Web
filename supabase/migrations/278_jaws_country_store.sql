-- Knucklehead's meeting point took the canyon's name when it was filed; it
-- is the parking, the way Sunny D's is.
update meeting_points
   set name = 'Knucklehead parking', updated_at = now()
 where name = 'Knucklehead Canyon (Wailua Nui)';

-- A Maui meeting point no canyon calls its usual: any Maui day can pick it.
-- Day 5 of course 59 (Oct 30) is at Rappel Maui and meets here at 09:00.
do $$
declare
  mp_id uuid;
begin
  select id into mp_id from meeting_points where name = 'Jaws Country Store';
  if mp_id is null then
    insert into meeting_points (name, venue_id)
    values ('Jaws Country Store', (select id from venues where name = 'Maui' and region_code = 'US-HI'))
    returning id into mp_id;
  end if;

  update schedule_days
     set meeting_point_id = mp_id,
         meets_elsewhere = false,
         meeting_time = '0900'
   where id = '274ddb18-2287-44c8-b530-91155261675b';
end $$;
