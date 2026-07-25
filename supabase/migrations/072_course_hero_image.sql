-- Per-course hero override for the client-facing quote page. Custom courses
-- match no service photo and fell back to the generic category image; admins
-- can now pin any photo from the site's pool and frame it (drag to position,
-- slider to zoom) — same storage convention as instructor avatars:
-- position "x% y%" text, scale as text, empty = default framing.

alter table public.course_instances
  add column if not exists hero_image    text,
  add column if not exists hero_position text,
  add column if not exists hero_scale    text;
