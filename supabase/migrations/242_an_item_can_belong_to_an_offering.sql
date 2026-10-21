-- Some library material is for one kind of course and no other: the ACA
-- swiftwater materials, a manufacturer's manual for kit only the aerial
-- courses carry. Until now the only thing an item could say was its
-- expertise, which is broader — "canyon" covers four offerings — so a manual
-- for one of them was offered to all four.
--
-- Null is the common answer and the default: most material is reached for by
-- expertise and by place, and an offering on every row would be a tag that
-- says "most of them", which filters nothing.
--
-- Text, not a foreign key, and nullable — the same way gear_lists holds an
-- offering. The slugs live in lib/courses.ts, and a retired one stays
-- readable on the row that was saved with it.
alter table public.library_items
  add column if not exists course_type text;

create index if not exists library_items_course_type_idx
  on public.library_items (course_type)
  where course_type is not null;
