-- The store's pin, from the Google Maps link Nadav sent
-- (maps.app.goo.gl/DnfaazfHTWb3s3wAA → 20.9227033,-156.2858675). Kept as
-- coordinates only: the pin opens whichever map you use (274).
update meeting_points
   set coords = '20.92270,-156.28587', updated_at = now()
 where name = 'Jaws Country Store'
   and coords is null;
