-- Retire confined_space as an expertise category.
--
-- Audited first: all ten instructors holding it also held `industry`, nine at
-- the identical level. The one exception (Eric Brandon: industry lead,
-- confined space assist) is a deliberate promotion — confirmed with the team.
-- Confined space work is now covered by the industry sign-off, and the
-- confined-space-rescue offering maps to industry in CATEGORY_COURSE_TYPES.

delete from public.instructor_capabilities where category = 'confined_space';

-- Custom courses tagged with it (PR-0041) keep their other categories; every
-- one already carries industry, so nothing loses its staffing match.
update public.course_instances
set custom_categories = array_remove(custom_categories, 'confined_space')
where custom_categories @> array['confined_space'];

-- Library items: none tagged today, but keep the data honest if any land
-- between writing and applying this.
update public.library_items
set disciplines = array_remove(disciplines, 'confined_space')
where disciplines @> array['confined_space'];
