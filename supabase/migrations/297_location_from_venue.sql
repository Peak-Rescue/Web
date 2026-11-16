-- A course with a venue and no Location printed nothing where its quotes,
-- invites and emails say where it is. From now on a blank Location is saved
-- as the venue ("Zion, UT", venuePlaceLine in lib/regions.ts); this does the
-- same for the courses already on the books. Only blanks: a typed Location is
-- never touched.

update course_instances c
set location = v.name || coalesce(', ' || coalesce(nullif(split_part(v.region_code, '-', 2), ''), v.region_code), '')
from venues v
where c.venue_id = v.id
  and coalesce(trim(c.location), '') = '';
