-- A course's points of contact are the client's people: the sergeant who
-- books the slot, the safety manager who signs the PO. They were typed onto
-- the course and stayed there, so the next course for the same client
-- started from a blank list and somebody retyped a phone number off an old
-- quote.
--
-- Same shape as a venue's contacts (238), for the same reason: the list is
-- short, it belongs to the thing it is about, and nothing else needs to join
-- against it.
alter table public.clients
  add column if not exists contacts jsonb not null default '[]'::jsonb;

comment on column public.clients.contacts is
  'The client''s own people — name, role, phone, email. Copied onto a course when one is built, never read live: the person a given course deals with is often a name for that week.';
