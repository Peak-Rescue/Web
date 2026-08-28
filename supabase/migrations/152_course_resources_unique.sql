-- The same bug 100 fixed for maps, in the table that copied maps' first draft.
--
-- 127 created course_resources "same shape as course_maps" — and faithfully
-- copied the *partial* unique index (where library_item_id is not null) that
-- 097 had, three migrations after 100 had already replaced it. ON CONFLICT
-- cannot use a partial index unless the query restates its predicate, which
-- PostgREST has no way to express, so adding a resource from the library has
-- raised "no unique or exclusion constraint matching the ON CONFLICT
-- specification" since the day the feature shipped.
--
-- A plain unique constraint does the job. NULLs are distinct in Postgres by
-- default, so the many pasted-link rows (library_item_id null) on one course
-- still coexist, while the same library document cannot be added twice.
drop index if exists public.course_resources_unique_item;

alter table public.course_resources drop constraint if exists course_resources_unique_item;
alter table public.course_resources add constraint course_resources_unique_item
  unique (instance_id, library_item_id);
