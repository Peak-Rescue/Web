-- Filing a course file to the library left no trace on the course. The row
-- knew where its bytes were and the library row knew the same path, so
-- "is this filed?" was a question answered by searching — and the answer
-- lasted until the page reloaded, because it only ever lived in the button's
-- own state.
--
-- With the id here, the course can say "in the library" and link to the row,
-- which is where the rest of the editing lives: expiry, offerings, the
-- second link, the topics.
alter table public.course_documents
  add column if not exists library_item_id uuid references public.library_items(id) on delete set null;

-- Filed before this column existed: the file is shared, not copied, so the
-- path is the join.
update course_documents d
set library_item_id = l.id
from library_items l
where d.library_item_id is null
  and d.path is not null
  and l.storage_path = d.path
  and l.status <> 'archived';
