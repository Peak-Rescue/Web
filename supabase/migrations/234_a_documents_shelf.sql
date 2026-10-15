-- A fifth shelf: Documents.
--
-- The four shelves were about teaching — what you teach from, what you look
-- things up in, what the instructor reads, and the maps. Everything that is
-- the company rather than the course has been living in whichever of those it
-- least embarrassed: eighteen logo files under Instructor material, the
-- employee handbook beside rope technique, worker incident forms filed as
-- reference. They are not reference. Nobody looks a logo up.
--
-- So: JPRs, daily risk and evac plans, client training programs, equipment
-- logs, and the Peak-specific paperwork — logos, incident forms, the handbook,
-- letterhead, the welcome letter, instructor expectations.
alter table public.library_items
  drop constraint if exists library_items_bucket_check;

alter table public.library_items
  add constraint library_items_bucket_check
  check (bucket in ('teaching', 'resource', 'map', 'instructor', 'documents'));
