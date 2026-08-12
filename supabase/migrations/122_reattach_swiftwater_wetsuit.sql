-- Put the wetsuit back in the alternative it belongs to.
--
-- 121 grouped (thick wetsuit AND rain jacket) OR drysuit. The wetsuit was then
-- swapped for the thin one through the admin UI while production was still
-- running the code from before 120 — which knows nothing about choices, so the
-- replacement row was written with no option_group at all.
--
-- The result read as "either a rain jacket, or a drysuit", with the wetsuit
-- floating outside the choice as though it were required on its own. This puts
-- it back on branch 0, next to the jacket.
--
-- No note is written. The thick one carried "Or a 5mm two-piece", which is not
-- true of a 2mm suit, and what else to say about it on this course is nobody's
-- call but the person building the list.
--
-- Only touches a row that has fallen out, so re-running it changes nothing.

update public.gear_list_entries e
set option_group = 'Exposure protection',
    option_branch = 0
from public.gear_items i
where e.gear_item_id = i.id
  and e.group_type = 'personal'
  and e.section = 'Environmental Layers'
  and i.name like '%wetsuit%'
  and e.option_group is null
  -- Only where the choice it should join actually exists.
  and exists (
    select 1 from public.gear_list_entries s
    where s.list_id = e.list_id
      and s.option_group = 'Exposure protection'
  );
