-- Until now every library row was a link: source_type allowed 'file' and
-- nothing ever wrote one, because there was nowhere to put the file. A
-- document uploaded on a course lives in the private task-documents bucket
-- and is read through a signed URL that expires in an hour, so filing one to
-- the library as a link would have filed a row that worked this afternoon
-- and 404'd tomorrow.
--
-- So the row holds the path, and the portal signs it on the way out. The
-- public-facing url for such a row is /api/library/file/<id>, which checks
-- who is asking before it signs anything.
alter table public.library_items
  add column if not exists storage_path text;

-- The second copy, for the files we own. Drive is not the filing system — one
-- flat folder, no shelves — it is somewhere the bytes also exist, because
-- Storage objects are not in the database's backups.
alter table public.library_items
  add column if not exists drive_backup_id text;

comment on column public.library_items.storage_path is
  'Supabase Storage object in task-documents, for rows whose source_type is file. Served through /api/library/file/<id>, never as a raw signed URL.';
comment on column public.library_items.drive_backup_id is
  'A copy of that object on the shared drive. Durability only — nothing reads it to render a row.';
