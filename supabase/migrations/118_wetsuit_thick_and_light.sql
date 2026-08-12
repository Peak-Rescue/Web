-- One "Wetsuit" type couldn't say which wetsuit.
--
-- A 2mm and a 4/3mm are not two products satisfying one need — they are two
-- different needs. Warm water wants the light one and cold water wants the
-- thick one, and a list that says "Wetsuit" and leaves the student to guess is
-- how someone arrives at a swiftwater course in a shorty.
--
-- So the split is at the type level, not the model level: two generic items,
-- each of which collects its own makes and models over time. A list picks the
-- one the course needs, and recommends products under it as usual.
--
-- The existing row becomes the thick one rather than being replaced, so the
-- NRS Radiant 4/3mm already under it stays where it belongs, along with the
-- swift_water tag and any list that already points at it.

update public.gear_items
set name = 'Thick wetsuit',
    info = coalesce(info, '4/3mm or heavier, or a 5mm two-piece. Cold water and swiftwater canyoning.'),
    -- Whoever reaches for this types "wetsuit" or a thickness, not "thick".
    aliases = array(select distinct unnest(aliases || array['wetsuit', '4/3mm', '5mm']))
where name = 'Wetsuit' and parent_id is null;

insert into public.gear_items (name, info, category, parent_id, aliases, disciplines, active)
select
  'Light wetsuit',
  '2mm. Warm water, or worn under a shell.',
  -- Filed and tagged like the thick one: same kind of kit, same job.
  t.category,
  null,
  array['wetsuit', '2mm', 'shorty'],
  t.disciplines,
  true
from public.gear_items t
where t.name = 'Thick wetsuit' and t.parent_id is null
  and not exists (
    select 1 from public.gear_items x where x.name = 'Light wetsuit' and x.parent_id is null
  );
