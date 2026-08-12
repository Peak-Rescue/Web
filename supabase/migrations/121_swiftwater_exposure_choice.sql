-- Turn the swiftwater list's exposure prose into the choice it describes.
--
-- These three rows are the reason 120 exists. They currently say, in notes:
--
--   Thick wetsuit — "Option 1 of 2, with a rain jacket."
--   Rain jacket   — "Worn with the wetsuit, as a layer to reduce wind chill."
--   Drysuit       — "Option 2 of 2, instead of the wetsuit and rain jacket."
--
-- Now the structure says it and the notes go back to describing their own gear.
-- The wetsuit and the jacket share a branch, because either you are taking that
-- route and need both or you are in the drysuit and need neither.
--
-- Gloves are in the same section and are deliberately left alone: they're
-- required whichever way you dress, which is exactly what a row outside the
-- choice means.
--
-- Matched on gear name within the section rather than on ids, so it reproduces
-- anywhere, and idempotent — a second run writes what's already there.

update public.gear_list_entries e
set option_group = 'Exposure protection',
    option_branch = case when i.name = 'Drysuit' then 1 else 0 end,
    note = case i.name
      when 'Thick wetsuit (4/3mm)' then 'Or a 5mm two-piece.'
      when 'Rain jacket'           then 'Lightweight. Cuts the wind chill in a canyon with little sun.'
      when 'Drysuit'               then 'Preferred outside the summer months. Needs a warm base layer.'
    end
from public.gear_items i
where e.gear_item_id = i.id
  and e.group_type = 'personal'
  and e.section = 'Environmental Layers'
  and i.name in ('Thick wetsuit (4/3mm)', 'Rain jacket', 'Drysuit');
