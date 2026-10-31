-- Discounts on a gear order: percent off a line, percent off the whole order, or
-- both, a line's first and the order's on top. Held on the order rather than the
-- catalog, because a discount is a deal with one team. unit_price stays the list
-- price, so what was given away can always be read back.
--
-- Additive, and safe ahead of the code.
alter table public.gear_order_lines
  add column if not exists discount_percent numeric(5,2) check (discount_percent >= 0 and discount_percent <= 100);

alter table public.gear_orders
  add column if not exists discount_percent numeric(5,2) check (discount_percent >= 0 and discount_percent <= 100);
