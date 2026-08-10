-- The gear catalog's categories said two different things at once.
--
-- Six described what a thing is — rope, sewn goods, hardware, layers, packs.
-- Two described what it is for: "Tactical" and "Rescue and access". Those two
-- were grab bags precisely because they were on the other axis; a drone, a
-- knife, a ladder and a litter share nothing as objects. It also left a
-- tactical helmet with nowhere good to go, being head protection by kind and
-- tactical by purpose, and forced to pick one.
--
-- Category is now kind only. Purpose is a discipline tag, the same vocabulary
-- courses and library items already use, so a thing can be both.
--
-- The other half of the problem was vagueness: "Rope hardware" held eleven of
-- the forty types — descenders, ascenders, pulleys, connectors, grabs and edge
-- protection — and named none of the jobs they do.
--
-- Mapping is by type name rather than id, so this reproduces on any database
-- and is idempotent: a second run matches rows that are already correct.

alter table public.gear_items
  add column if not exists disciplines text[] not null default '{}';

comment on column public.gear_items.disciplines is
  'What this gear is FOR, from the capability vocabulary. Category says what it IS; the two are different axes.';

create index if not exists gear_items_disciplines on public.gear_items using gin (disciplines);

-- ─── Categories, by kind ────────────────────────────────────────────────────

update public.gear_items set category = 'Rope and cord'
  where parent_id is null and name in
    ('8mm and under rope', '9.5mm tactical response rope', 'Cordelette', 'Webbing');

update public.gear_items set category = 'Slings and prusiks'
  where parent_id is null and name in
    ('Single length sling', 'Double length sling', 'Prusik');

update public.gear_items set category = 'Connectors'
  where parent_id is null and name in ('Locking carabiners', 'Quick link');

update public.gear_items set category = 'Descent and belay'
  where parent_id is null and name in ('Brake-assist descender', 'Tube-style belay device');

update public.gear_items set category = 'Ascenders and rope grabs'
  where parent_id is null and name in
    ('Hand ascender', 'Chest ascender', 'Foot ascender', 'Rope grab');

update public.gear_items set category = 'Pulleys'
  where parent_id is null and name in ('Compact pulley', 'Progress capture pulley');

update public.gear_items set category = 'Harness and personal rigging'
  where parent_id is null and name in ('Harness', 'Adjustable lanyard');

update public.gear_items set category = 'Helmets and protection'
  where parent_id is null and name in ('Helmet', 'Gloves', 'Edge protection sleeves');

update public.gear_items set category = 'Clothing and exposure'
  where parent_id is null and name in
    ('Drysuit', 'Wetsuit', 'Rain jacket', 'Mountain footwear');

-- Headlamp was filed as protective equipment and a water bottle as carry; a
-- light is not protection and a bottle is not a pack, they were just nearest.
update public.gear_items set category = 'Packs and carry'
  where parent_id is null and name in
    ('Backpack', 'Dump pouch', 'Rope bag', 'Water bottle');

update public.gear_items set category = 'Lighting and optics'
  where parent_id is null and name in ('Headlamp', 'NVGs');

update public.gear_items set category = 'Patient handling and access'
  where parent_id is null and name in
    ('PJ Sked', 'Ladders', 'Winch (if team owns one)', 'Leader line', 'Drone');

update public.gear_items set category = 'Mission kit'
  where parent_id is null and name in
    ('Bungee cord for weapon retention', 'Full tactical loadout kit for relevant mission set', 'Knife');

-- ─── Purpose, as tags ───────────────────────────────────────────────────────
-- Only where the type itself states it. Everything else is left empty: an
-- unmarked item is obviously unmarked, where a guessed tag reads as a decision
-- someone made.

update public.gear_items set disciplines = array['swift_water']
  where parent_id is null and name in ('Drysuit', 'Wetsuit');

update public.gear_items set disciplines = array['jungle_mobility']
  where parent_id is null and name = 'PJ Sked';

-- ─── Products follow their type ─────────────────────────────────────────────
-- A product is the same kind of kit as what it satisfies. The app enforces
-- this on write now; this brings the rows already in the table into line.

update public.gear_items p
set category = t.category
from public.gear_items t
where p.parent_id = t.id and p.category is distinct from t.category;
