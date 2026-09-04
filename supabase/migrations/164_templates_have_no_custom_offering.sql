-- 'custom' is not an offering. Every bespoke course shares the slug, so a
-- template tagged with it matched nothing that an untagged template didn't --
-- it only wore a "Custom Course" pill, and sat outside the offering picker,
-- which has no such option to pick back once you changed it.
--
-- Templates only. A course's own list keeps its course_type as it is.
update course_schedules set course_type = null
  where is_template = true and course_type = 'custom';

update gear_lists set course_type = null
  where is_template = true and course_type = 'custom';
