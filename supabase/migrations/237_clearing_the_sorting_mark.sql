-- Taking the "needs sorting" mark off a batch.
--
-- The mark lives in `topics`, which is also the box people type their own tags
-- into — so it turned up in that box as a word to hand-delete before saving,
-- which is the plumbing showing through. Nobody should have to remember to
-- remove a marker the software put there.
--
-- A function because the alternative is reading every row, filtering an array
-- in JavaScript and writing them back one at a time. array_remove is exact,
-- removes nothing when the mark is not there, and leaves every other tag
-- alone.
create or replace function public.clear_sorting_mark(ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.library_items
     set topics = array_remove(topics, 'needs-sorting'),
         updated_at = now()
   where id = any(ids)
     and 'needs-sorting' = any(topics);
$$;

-- Service role only, like everything else that writes to this table: every
-- caller is a server action that has already checked the role.
revoke all on function public.clear_sorting_mark(uuid[]) from public, anon, authenticated;
