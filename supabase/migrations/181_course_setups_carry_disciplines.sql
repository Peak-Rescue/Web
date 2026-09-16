-- Course setups (the curriculum shelf) learn the same tag every other shelf
-- carries.
--
-- 103 gave gear lists and schedules a `disciplines` array so a course page
-- could offer the templates that fit it first. The curriculum setups were
-- left out, and matching them fell back to an exact course_type compare —
-- which reached no custom course at all, however many boxes were ticked on it,
-- and left the five setups that belong to no single offering (HAZMAT, Tower,
-- Helicopter Operations, Basic Mountain Operator, Canyon ICA Guides) matching
-- nothing anywhere.
--
-- Expand only: an empty array reads exactly as the table read yesterday, so
-- this can land before the code that writes it.

alter table public.course_templates
  add column if not exists disciplines text[] not null default '{}';

comment on column public.course_templates.disciplines is
  'Capability categories this setup is for. Matched against a course''s own — see templateRelevance. The offering in course_type implies its own, so this is for what the offering does not say.';

create index if not exists course_templates_disciplines_idx
  on public.course_templates using gin (disciplines);
