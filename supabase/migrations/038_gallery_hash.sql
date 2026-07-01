-- Content hash (SHA-256 of the file bytes) for duplicate detection.
-- Nullable: pre-existing rows have no hash. NULLs are distinct in a unique
-- index, so multiple legacy rows are fine; new uploads get a hash that must
-- be unique, which blocks re-uploading the same file.

alter table public.gallery_images add column if not exists hash text;

create unique index if not exists gallery_images_hash_key
  on public.gallery_images (hash);
