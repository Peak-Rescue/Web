-- Upper and Lower meet at the same trailhead.
--
-- Lower had no usual meetup at all, and both canyons carried the same pasted
-- "trailhead" link — one place, written down twice as a link and never as a
-- place. Upper's meetup is that trailhead (its pin and the link resolve to
-- the same 20.811, -156.114), so Lower points at it too.
--
-- Renamed with it: "Emerald Canyon (Upper)" was the right name while one
-- canyon used it — our own default, taken from the canyon it was made the
-- usual for — and the wrong one the moment Lower meets there as well. A
-- meetup is named for where it is, not for who turns up.

update meeting_points
   set name = 'Emerald Canyon trailhead', updated_at = now()
 where id = '7c07f711-641d-4491-9630-d1ba7e7c4f7b';

update sites
   set meeting_point_id = '7c07f711-641d-4491-9630-d1ba7e7c4f7b'
 where id = '15b6230b-4fd1-4171-9bab-3262102b302c';

-- And now the link can go from both: the meetup carries the pin, and the pin
-- opens whichever map you use.
update sites
   set links = (
         select coalesce(jsonb_agg(l), '[]'::jsonb)
           from jsonb_array_elements(links) as l
          where l->>'url' <> 'https://maps.app.goo.gl/kf66GApD19rQY7Ed8'
       )
 where id in ('c90fb06c-3240-4253-9944-833589c50eae', '15b6230b-4fd1-4171-9bab-3262102b302c');
