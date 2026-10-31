-- The ski kit a team asked us to put a list together for, and that list as the
-- first order with no course. Data only.
--
-- Helmet is already in the catalog and is reused. "Boot" is not: that row is the
-- canyon boot, so ski boots get their own. Generic items carry no link or price,
-- and the four products named so far carry their links and no price: what we
-- charge has not been decided. The order stays a draft; nothing is sent.
do $$
declare
  o uuid;
  shell_id uuid; pants_id uuid; socks_id uuid; base_bottom_id uuid;
begin
  insert into public.gear_items (name, category)
  select v.name, v.category
  from (values
    ('Skis', 'Snow travel'),
    ('Skins', 'Snow travel'),
    ('Ski bindings', 'Snow travel'),
    ('Ski boots', 'Snow travel'),
    ('Ski poles', 'Snow travel'),
    ('Waterproof shell jacket', 'Clothing and exposure'),
    ('Waterproof shell pants', 'Clothing and exposure'),
    ('Goggles', 'Helmets and protection'),
    ('Ski socks', 'Clothing and exposure'),
    ('Base layer top', 'Clothing and exposure'),
    ('Base layer bottom', 'Clothing and exposure')
  ) as v(name, category)
  where not exists (select 1 from public.gear_items g where lower(g.name) = lower(v.name));

  insert into public.gear_items (name, brand, url, category, parent_id)
  select v.name, 'Black Diamond', v.url, p.category, p.id
  from (values
    ('Recon Stretch Shell (Men''s)', 'Waterproof shell jacket', 'https://blackdiamondequipment.com/products/mens-recon-stretch-shell?variant=50483864633661'),
    ('Recon Stretch Pants (Men''s)', 'Waterproof shell pants', 'https://blackdiamondequipment.com/products/mens-recon-stretch-pants?variant=50481489609021'),
    ('Touring Compression Ski Socks', 'Ski socks', 'https://blackdiamondequipment.com/products/bd-touring-compression-ski-socks'),
    ('Coefficient LT Pants (Men''s)', 'Base layer bottom', 'https://blackdiamondequipment.com/products/mens-coefficient-lt-pants')
  ) as v(name, parent, url)
  join public.gear_items p on lower(p.name) = lower(v.parent) and p.parent_id is null
  where not exists (select 1 from public.gear_items g where lower(g.name) = lower(v.name));

  insert into public.gear_orders (title) values ('Ski touring gear list') returning id into o;

  insert into public.gear_order_lines (order_id, gear_item_id, name, category, url, sort_order)
  select o, i.id,
         case when i.brand is null then i.name else i.brand || ' ' || i.name end,
         i.category, i.url, v.ord
  from (values
    ('Skis', 0), ('Skins', 1), ('Ski bindings', 2), ('Ski boots', 3), ('Ski poles', 4),
    ('Recon Stretch Shell (Men''s)', 5), ('Recon Stretch Pants (Men''s)', 6),
    ('Goggles', 7), ('Helmet', 8),
    ('Touring Compression Ski Socks', 9), ('Base layer top', 10), ('Coefficient LT Pants (Men''s)', 11)
  ) as v(name, ord)
  join public.gear_items i on lower(i.name) = lower(v.name) and i.active;
end $$;
