-- An order line leads with what is needed and names the product under it:
-- "Waterproof shell jacket", then "Black Diamond Recon Stretch Shell". The
-- catalog already holds gear that way round. A line copied the product's name
-- into its only name field, so a team read a shopping list of brands, and a
-- second option for the same need would have had nowhere to sit.
--
-- Backfill for orders with no course only; course orders have no products to
-- split out. A name somebody already rewrote by hand is theirs and stays.
alter table public.gear_order_lines
  add column if not exists product text;

update public.gear_order_lines l
   set product = case when i.brand is null then i.name else i.brand || ' ' || i.name end,
       name = case
         when l.name = case when i.brand is null then i.name else i.brand || ' ' || i.name end then p.name
         else l.name
       end
  from public.gear_items i
  join public.gear_items p on p.id = i.parent_id,
       public.gear_orders o
 where l.gear_item_id = i.id
   and o.id = l.order_id
   and o.instance_id is null;
