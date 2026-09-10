-- Aerial Tramway Rescue moved from Industrial & Facilities to Backcountry & SAR
-- in lib/data/services.ts. course_instances.course_category is a copy of that
-- category taken when the course was created, and the admin course form picks
-- the type from the list of offerings *under the chosen category* — so a course
-- left on 'industrial' opens with a category whose type list no longer contains
-- its own course type, and the type select shows empty. Six live courses.
--
-- Sector is unaffected: only 'tactical' means military, and both the old and
-- the new value are civilian.

update public.course_instances
   set course_category = 'sar'
 where course_type = 'aerial-tramway-rescue'
   and course_category = 'industrial';
