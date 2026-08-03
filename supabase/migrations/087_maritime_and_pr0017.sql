-- Two corrections to the military expertise split.
--
-- 1. Water and maritime mobility are distinct skill areas, not one. 086
--    lumped them together; splitting them here. Everyone currently holding
--    mil_water was eligible for both offerings, so they get mil_maritime at
--    the same role — preserving today's meaning, to be narrowed per person.
--
-- 2. PR-0017 (Red Team, canyoning / arborist rescue) is military canyoning in
--    a military context, not a civilian canyon course. It was carrying the
--    civilian `canyoning` tag alongside the tactical ones; narrowing it to
--    military canyon mobility.

insert into public.instructor_capabilities (instructor_id, category, role)
select instructor_id, 'mil_maritime', role
from public.instructor_capabilities
where category = 'mil_water'
on conflict (instructor_id, category) do nothing;

-- Courses matching on mil_water were matching maritime offerings too.
update public.course_instances
set custom_categories = custom_categories || array['mil_maritime']
where custom_categories @> array['mil_water']
  and not custom_categories @> array['mil_maritime'];

update public.course_instances
set custom_categories = array['mil_canyon']
where ref_number = 17;
