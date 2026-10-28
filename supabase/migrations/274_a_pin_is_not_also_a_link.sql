-- The Google Maps links that say what the coordinates already say.
--
-- They were added when coordinates were text to copy: the only way to hand
-- somebody a pin was to paste a maps link beside it. The pin is pressable now
-- — it offers Google Maps, Apple Maps, the phone's own chooser and CalTopo —
-- so the link is a second row saying the same thing, and the one that cannot
-- be opened in the map you actually use.
--
-- Only where the link resolves to that record's own coordinates. Each of
-- these three was followed and checked:
--
--   Garden of Eden Arboretum entrance  20.87057,-156.1799  = its coords
--   Sunny D Parking                    20.87291,-156.1840  = its coords
--   Emerald Canyon (Upper) [meetup]    20.81099,-156.1146  = its coords
--
-- The "trailhead" links on the Emerald Canyon sites are left alone: they
-- resolve to the meetup's pin, not to either canyon's own coordinates, so
-- dropping them would lose a place rather than a duplicate.

update meeting_points
   set links = (
         select coalesce(jsonb_agg(l), '[]'::jsonb)
           from jsonb_array_elements(links) as l
          where l->>'url' not like '%maps.app.goo.gl%'
       ),
       updated_at = now()
 where coords is not null
   and links::text like '%maps.app.goo.gl%';
