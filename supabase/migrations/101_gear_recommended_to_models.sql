-- Retire the free-text recommendations that the type/model feature replaced.
--
-- 096 built types, models and "any of these will do", but left the old
-- `recommended` text in place. So a row said the same thing twice, in two
-- voices, and they had already begun to drift apart: the catalog holds "Petzl
-- Basic" while a list holds "Petzl BASIC", the catalog holds "Petzl Reverso"
-- while the list that meant it never ticked it.
--
-- The text was doing two unrelated jobs. One was naming products — exactly
-- what a model is, and now pure duplication. The other was spec, quantity and
-- condition: "At least 4 spare", "Plus spare batteries", "Mountaineering or
-- canyoning rated". No model can carry those, and nothing here touches them.
--
-- Only the product names go. Every product named already exists as a model —
-- this adds nothing to the catalog, it ticks boxes and deletes words.
--
-- Matched on the recommended text itself rather than on ids, which differ per
-- environment. That also makes it idempotent: the statement clears the text it
-- matched on, so a second run matches nothing.

-- ---------------------------------------------------------------------------
-- 1. Entries whose text named models nobody had ticked.
-- ---------------------------------------------------------------------------

insert into public.gear_entry_options (entry_id, gear_item_id, sort_order)
select e.id, m.id, v.ord
from public.gear_list_entries e
join (values
  ('Team Wendy SAR Tactical',                          'Team Wendy SAR Tactical',   0),
  ('BD Infinity Cord',                                 'BD Infinity Cord',          0),
  ('Sentinel Series Tactical Operations Dry Suit',     'Sentinel Tactical Operations Dry Suit', 0),
  ('Petzl VERTIGO TWIST-LOCK or WILLIAM',              'Petzl Vertigo Twist-Lock',  0),
  ('Petzl VERTIGO TWIST-LOCK or WILLIAM',              'Petzl William',             1),
  ('Petzl Am''D TWIST-LOCK',                           'Petzl Am''D Twist-Lock',    0),
  ('DMM Ultra O Kwiklock, or Petzl Am''D TWIST-LOCK',  'DMM Ultra O Kwiklock',      0),
  ('DMM Ultra O Kwiklock, or Petzl Am''D TWIST-LOCK',  'Petzl Am''D Twist-Lock',    1),
  ('Petzl MINI TRAXION',                               'Petzl Mini Traxion',        0),
  -- Already ticked BD ATC Guide; the text also named the Reverso, so clearing
  -- it without this would quietly narrow the list to one device.
  ('BD ATC Guide, Petzl REVERSO',                      'BD ATC Guide',              0),
  ('BD ATC Guide, Petzl REVERSO',                      'Petzl Reverso',             1),
  -- Model plus a genuine spec; the spec is preserved in step 3.
  ('NRS Men''s Radiant 4/3mm Wetsuit, or a 5mm two-piece', 'NRS Radiant 4/3mm',     0)
) as v(rec, model, ord) on e.recommended = v.rec
join public.gear_items m on m.name = v.model and m.parent_id is not null
-- The model has to belong to the type the entry actually names, so a name
-- collision can't tick a model from some unrelated type.
where m.parent_id = e.gear_item_id
on conflict (entry_id, gear_item_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Entry text that is now fully carried by the ticked models.
-- ---------------------------------------------------------------------------

update public.gear_list_entries
set recommended = null
where recommended in (
  'Team Wendy SAR Tactical',
  'BD Infinity Cord',
  'Sentinel Series Tactical Operations Dry Suit',
  'Petzl VERTIGO TWIST-LOCK or WILLIAM',
  'Petzl Am''D TWIST-LOCK',
  'DMM Ultra O Kwiklock, or Petzl Am''D TWIST-LOCK',
  'Petzl MINI TRAXION',
  'Petzl BASIC',                  -- Petzl Basic was already ticked
  'BD ATC Guide, Petzl REVERSO',
  'VT 8mm Prusik',                -- entry names the VT Prusik model; "8mm" is on it
  '60cm Dyneema sling',           -- repeated the row's own name
  'Any lightweight rain jacket.'  -- the type already says "Lightweight"
);

-- ---------------------------------------------------------------------------
-- 3. Entry text that was part product, part spec. The product became a tick
--    above; what is left is the part no model can say.
-- ---------------------------------------------------------------------------

update public.gear_list_entries
set recommended = 'With one twist-locking carabiner'
where recommended = 'CONNECT ADJUST with one twist-locking carabiner';

update public.gear_list_entries
set recommended = 'Or a 5mm two-piece'
where recommended = 'NRS Men''s Radiant 4/3mm Wetsuit, or a 5mm two-piece';

-- Left alone on purpose: "Insulated dipped work gloves (Home Depot)" names no
-- product we stock as a model, and the parenthetical is the useful part.

-- ---------------------------------------------------------------------------
-- 4. Catalog types whose text only listed their own models.
-- ---------------------------------------------------------------------------

-- The size qualifier is a property of the Croll, not of "Chest ascender".
update public.gear_items
set recommended = 'Small'
where name = 'Petzl Croll'
  and parent_id is not null
  and coalesce(recommended, '') = ''
  and exists (
    select 1 from public.gear_items t
    where t.id = public.gear_items.parent_id
      and t.recommended = 'Petzl Croll (small)'
  );

update public.gear_items
set recommended = null
where parent_id is null
  and recommended in (
    'Petzl Rig, Grigri or Skylotec Spark',  -- all three are models
    'BD ATC Guide or Petzl Reverso',        -- both are models
    'Petzl ROLLCLIP A (non-locking)',       -- the RollClip model already says "Non-locking"
    'Petzl Croll (small)'                   -- moved onto the model just above
  );

-- Everything else in gear_items.recommended stays. It is spec, not product:
-- "At least 4 spare", "Plus spare batteries", "Mountaineering or canyoning
-- rated", "The one you carry and can access", "18-24 ft of cord", "20 ft of 1
-- inch tubular", "Stainless steel 8mm quick link", "Boots or approach shoes",
-- "With a warm base layer", "4/3mm for swiftwater canyoning", "Lightweight",
-- "Mountaineering harness". That is the field doing the job it is good at.
