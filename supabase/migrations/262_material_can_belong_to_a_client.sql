-- Some material is somebody's: a resort's patrol manual, a squadron's SOP, a
-- plant's permit. It is ours to hold and theirs to be about, and the library
-- had no way to say so — so it sat on a shelf looking like something to teach
-- any course from.
--
-- Nullable and on every shelf, because the filing panel asks one set of
-- questions wherever it is opened (256, 258, 260). Set null on delete: losing
-- a client must never take the document with it.
do $$
declare t text;
begin
  foreach t in array array['library_items', 'gear_lists', 'course_schedules', 'course_templates'] loop
    execute format(
      'alter table public.%I add column if not exists client_id uuid references public.clients(id) on delete set null', t);
    execute format('create index if not exists %I on public.%I (client_id) where client_id is not null',
      t || '_client_idx', t);
  end loop;
end $$;

comment on column public.library_items.client_id is
  'The client this material belongs to, where it belongs to one. Null is the usual answer: most of the library is ours.';
