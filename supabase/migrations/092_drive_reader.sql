-- Which staff account can actually read a given Drive file.
--
-- Classroom attachments live in whoever's Drive uploaded them, shared with
-- that class's members. info@ — the account the portal reads as — is in none
-- of those classes, so about a third of files came back 403/404 for it, while
-- being perfectly readable as micah@ or eric@.
--
-- Domain-wide delegation already lets the portal act as any account in the
-- domain, so this is a lookup problem, not a permissions one: remember which
-- account could open each file and read as them next time. No one has to
-- re-share anything.

alter table public.library_items
  add column if not exists drive_reader text;

comment on column public.library_items.drive_reader is
  'Workspace account that can read this Drive file; the portal impersonates it. Null = try the default.';
