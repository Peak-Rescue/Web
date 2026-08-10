-- A prusik is its own type, and the sling categories split by how you buy it.
--
-- Two changes that turn out to be the same change.
--
-- "Prusik" was only an alias on "Rope grab", which also holds the Petzl TibLoc
-- and the CT Roll n Lock. Those are mechanical devices; a prusik is a sewn cord
-- tied as a friction hitch. Filing them together meant a list asking for a rope
-- grab could be satisfied with either, and the two lists that wanted the VT
-- named the model directly to get around it.
--
-- And once a prusik is its own type it has nowhere good to go, because
-- "Slings and webbing" mixed sewn finished goods with material sold by the
-- foot: the 60cm sling sat beside the 20 ft of tubular webbing you cut and tie
-- yourself. The honest axis is what you buy — sewn and ready, or a length you
-- cut. So the two categories split along it.

-- ---------------------------------------------------------------------------
-- 1. Prusik becomes a type, alongside Rope grab rather than inside it.
-- ---------------------------------------------------------------------------

insert into public.gear_items (name, category, info, aliases)
select 'Prusik', 'Sewn slings and cord',
       'A sewn eye-to-eye cord used as a friction hitch for ascent and lowering.',
       array['prusik', 'friction hitch', 'vt']
where not exists (
  select 1 from public.gear_items where name = 'Prusik' and parent_id is null
);

-- Rope grab keeps the mechanical devices and gives up the alias, which now
-- points somewhere more specific.
update public.gear_items
set aliases = array_remove(aliases, 'prusik')
where name = 'Rope grab' and parent_id is null;

-- The model we actually want people to buy, named as the product rather than
-- as the hitch. "8mm" was the recommendation; it is in the name now.
update public.gear_items
set name        = 'Blue Water VT 8mm',
    parent_id   = (select id from public.gear_items where name = 'Prusik' and parent_id is null),
    category    = 'Sewn slings and cord',
    recommended = null,
    info        = null,
    aliases     = array['vt', 'vt prusik', 'blue water', 'bluewater']
where name = 'VT Prusik' and parent_id is not null;

-- ---------------------------------------------------------------------------
-- 2. The two lists named the model directly, because the type they wanted did
--    not exist. Point them at the type and tick the model, which is how every
--    other line on those lists now reads.
-- ---------------------------------------------------------------------------

insert into public.gear_entry_options (entry_id, gear_item_id, sort_order)
select e.id, m.id, 0
from public.gear_list_entries e
join public.gear_items m on m.name = 'Blue Water VT 8mm' and m.parent_id is not null
where e.gear_item_id = m.id
on conflict (entry_id, gear_item_id) do nothing;

update public.gear_list_entries
set gear_item_id = (select id from public.gear_items where name = 'Prusik' and parent_id is null),
    -- The type carries the description now, so the per-list copy of it goes.
    info = case when info = 'A sewn eye-to-eye cord used as a rope grab.' then null else info end
where gear_item_id = (
  select id from public.gear_items where name = 'Blue Water VT 8mm' and parent_id is not null
);

-- ---------------------------------------------------------------------------
-- 3. Split the sling and rope categories by sewn-versus-cut.
-- ---------------------------------------------------------------------------

-- Finished sewn goods, used as they come.
update public.gear_items
set category = 'Sewn slings and cord'
where name in ('Single length sling', 'Double length sling', 'BD Infinity Cord');

-- Bought by the length and cut. The cordelette moves across: it was filed with
-- the sewn slings, but it is 18-24 ft of cord you cut and tie.
update public.gear_items
set category = 'Rope, cord and webbing'
where name in ('Webbing', 'Cordelette', '8mm and under rope', '9.5mm tactical response rope');

-- Nothing should be left pointing at the old names.
update public.gear_items set category = 'Sewn slings and cord'    where category = 'Slings and webbing';
update public.gear_items set category = 'Rope, cord and webbing'  where category = 'Ropes and cord';
update public.gear_list_entries set category = 'Sewn slings and cord'   where category = 'Slings and webbing';
update public.gear_list_entries set category = 'Rope, cord and webbing' where category = 'Ropes and cord';
