-- Secondary point of contact on a course instance — either a second person
-- or an alternate phone/email for the primary POC (leave the name blank).

alter table public.course_instances
  add column if not exists contact2_name  text,
  add column if not exists contact2_phone text,
  add column if not exists contact2_email text;
