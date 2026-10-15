-- The locals, kept apart from the client.
--
-- `contacts` is the course's points of contact: who booked it, who is invoiced,
-- who to ring about the people coming. A ranger district is none of those. It
-- was offered into that list and read as a POC the moment it landed there,
-- which is exactly wrong on the one list a quote gets sent from.
--
-- So its own column. Copied from the venue rather than pointed at, because the
-- person a given course deals with is often a name for that week, and editing
-- it must not rewrite the venue for everyone.
alter table public.course_instances
  add column if not exists place_contacts jsonb not null default '[]'::jsonb;

comment on column public.course_instances.place_contacts is
  'Contacts for where the course is — ranger district, landowner, gate code. Not the client POCs, which are `contacts`.';
