-- Nine catalog rows are filed under categories the app doesn't have.
--
-- 108 fixed the category vocabulary by matching on type names, and two of the
-- names it matched on have changed since: 'PJ Sked' became the model 'PJ' under
-- brand Sked, and 'Winch (if team owns one)' became 'Winch'. Those rows kept
-- the old 'Rescue'. 'Clothing and footwear' is the same story from the other
-- direction — the four exposure types were renamed back by hand afterwards.
--
-- It matters because the category is what browsing is built on. The course gear
-- picker lists GEAR_CATEGORIES filtered to the ones holding something, so a
-- category that isn't in that list holds nothing as far as the picker knows:
-- the wetsuit, the drysuit, the litter and the winch could only be reached by
-- typing their names. A category off the vocabulary is a hidden item.
--
-- Matched on the current names this time, and on the fact that a product
-- follows its type, so a later rename can't strand these again.

update public.gear_items set category = 'Clothing and exposure'
  where parent_id is null and category = 'Clothing and footwear';

-- 'Rescue' predates the split of kind from purpose. A litter and a winch are
-- both things you move a patient with, which is what the category is called now.
update public.gear_items set category = 'Patient handling and access'
  where parent_id is null and category = 'Rescue';

-- Products follow their type, the same rule the app enforces on write.
update public.gear_items p
set category = t.category
from public.gear_items t
where p.parent_id = t.id and p.category is distinct from t.category;
