-- The Recon Gloves link was typed on its order line before the line had a
-- product, so it never reached the catalog. Copied across, as choosing the
-- product now does on its own.
update public.gear_items i
   set url = l.url
  from public.gear_order_lines l
 where i.id = '2451d9b9-8cd9-4abe-9a22-3b4c4ccddc0f'
   and l.id::text like 'decb4efd%'
   and l.gear_item_id = i.id
   and i.url is null
   and l.url is not null;
