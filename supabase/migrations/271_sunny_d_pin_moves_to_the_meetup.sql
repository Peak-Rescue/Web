-- Sunny D's Google Maps link was saved on one course day rather than on the
-- meetup, so the next course there would not have had it. And that day held a
-- typed copy of the meetup's coordinates, which since 270 reads as a note.
-- The link moves to Sunny D Parking, and the day goes back to following the
-- canyon's usual with nothing typed over it.
update meeting_points
   set links = '[{"url":"https://maps.app.goo.gl/78Y8NYw2eXFPSasc9","label":"Google Maps"}]'::jsonb,
       updated_at = now()
 where id = '9894b77a-cd89-417a-a569-c73bdc004c74'
   and links = '[]'::jsonb;

update schedule_days
   set meeting_point = null,
       meeting_point_id = null,
       meeting_links = '[]'::jsonb
 where id = 'fe4afaf7-e8c9-4453-a92d-f1d831d6d909'
   and meeting_point = '20.87291, -156.18402';
