-- Recon Gloves went in with no brand, the only product in the catalog without
-- one. Its link is blackdiamondequipment.com. Its order line holds its own copy
-- of the name, so that is corrected too.
update public.gear_items
   set brand = 'Black Diamond'
 where id = '2451d9b9-8cd9-4abe-9a22-3b4c4ccddc0f'
   and brand is null;

update public.gear_order_lines
   set product = 'Black Diamond Recon Gloves'
 where gear_item_id = '2451d9b9-8cd9-4abe-9a22-3b4c4ccddc0f'
   and product = 'Recon Gloves';
