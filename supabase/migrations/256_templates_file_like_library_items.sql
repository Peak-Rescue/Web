-- A gear list, a schedule and a course setup sit on library shelves and are
-- found the same way library items are — by what they are for, where they
-- are about, and soon by which client. They were built as their own tables
-- with their own one-offering column, so the filing questions the library
-- learned to ask never reached them: no location at all, and one offering
-- where a list for two is a sentence anybody would say.
--
-- Same shape as library_items (242, 250): a list of offerings, and the three
-- columns a place resolves to. Expand only — course_type stays until nothing
-- reads it.
do $$
declare t text;
begin
  foreach t in array array['gear_lists', 'course_schedules', 'course_templates'] loop
    execute format('alter table public.%I add column if not exists course_types text[] not null default ''{}''', t);
    execute format('alter table public.%I add column if not exists venue_id uuid references public.venues(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists site_id uuid references public.sites(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists region text', t);
    execute format('update public.%I set course_types = array[course_type] where course_type is not null and course_types = ''{}''', t);
    execute format('create index if not exists %I on public.%I using gin (course_types)', t || '_course_types_idx', t);
  end loop;
end $$;
