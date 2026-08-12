-- Put the thickness where the student will actually see it.
--
-- 118 split the wetsuit into a thick one and a light one and put the numbers in
-- `info`. Nothing shows `info` to a student — the portal selects name, brand,
-- url and category — so the split reached the person building the list and
-- stopped there. "Light wetsuit" on a course page is two words and no number,
-- and it has no products under it to leak the spec through the way the thick
-- one does via the NRS Radiant 4/3mm.
--
-- The name is the one field guaranteed to reach the student, so the spec goes
-- in the name. Adjective first, like the hand / chest / foot ascenders, which
-- also happens to sort "Thick" and "Thin" next to each other.
--
-- `info` keeps what the name can't hold — what the suit is for, and that a 5mm
-- two-piece also satisfies the thick one.

update public.gear_items
set name = 'Thick wetsuit (4/3mm)'
where name = 'Thick wetsuit' and parent_id is null;

update public.gear_items
set name = 'Thin wetsuit (2mm)',
    info = 'Warm water, or worn under a shell.',
    aliases = array(select distinct unnest(aliases || array['light wetsuit', 'thin']))
where name = 'Light wetsuit' and parent_id is null;

update public.gear_items
set info = 'Or a 5mm two-piece. Cold water and swiftwater canyoning.'
where name = 'Thick wetsuit (4/3mm)' and parent_id is null;
