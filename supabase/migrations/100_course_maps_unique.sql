-- Adding a map from the library always failed: 097 created a *partial* unique
-- index (where library_item_id is not null), and ON CONFLICT cannot use a
-- partial index unless the query restates its predicate — which PostgREST has
-- no way to express. Every upsert raised "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- A plain unique constraint does the job. NULLs are distinct in Postgres by
-- default, so the many pasted-link rows (library_item_id null) on one course
-- still coexist, while the same library map cannot be added twice.

drop index if exists public.course_maps_unique_item;

alter table public.course_maps drop constraint if exists course_maps_unique_item;
alter table public.course_maps add constraint course_maps_unique_item
  unique (instance_id, library_item_id);
