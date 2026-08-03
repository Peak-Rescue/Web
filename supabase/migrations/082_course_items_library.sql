-- Wire the content library into the course Content sections that already
-- exist, rather than running two parallel systems.
--
-- course_items becomes either a free-typed one-off (as today) or a reference
-- to a library_item. References carry no copy of the title or URL, so editing
-- the library entry updates every course pointing at it — the whole reason for
-- the library, given 134 Drive files are currently duplicated across classes.
--
-- instance_materials (081) is dropped: sections are the better home for
-- course material, and one model beats two. It was never populated.

drop table if exists public.instance_materials;

alter table public.course_items
  add column if not exists library_item_id uuid references public.library_items(id) on delete cascade,
  -- null = inherit the library item's own audience. Set to override for one
  -- course (a permit a particular client needs, say).
  add column if not exists audience text check (audience in ('internal', 'shared'));

-- Library-referenced rows take title/url/type from the library entry.
alter table public.course_items alter column url  drop not null;
alter table public.course_items alter column type drop not null;

create index if not exists course_items_library_idx on public.course_items (library_item_id);

-- A library item should only appear once in a given section.
create unique index if not exists course_items_module_library_uniq
  on public.course_items (module_id, library_item_id)
  where library_item_id is not null;
