-- Custom courses have no course-type slug, so they can't be matched to
-- instructor expertise via CATEGORY_COURSE_TYPES. Admins tag them with
-- capability categories instead — drives instructor calendar visibility
-- and staffing qualification matching.

alter table public.course_instances
  add column if not exists custom_categories text[];
