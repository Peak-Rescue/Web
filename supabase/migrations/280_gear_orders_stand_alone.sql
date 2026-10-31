-- A gear order that belongs to no course.
--
-- Teams we work with have started asking us for gear with no course in sight:
-- a list to look over, priced, that they might buy from us. 148 tied an order
-- to a course because that was the only journey then, and the course supplied
-- everything the order did not hold: its name, its client, who to email. So an
-- order without one carries those itself, and the check below is what stops a
-- row having neither a course nor a name to read as.
--
-- The catalog gains the price 148 said it would eventually have. It is what we
-- charge, not retail, and a line copies it the way a line copies everything
-- else: a catalog edit next month must not move a number a team was already
-- given. gear_item_id is kept beside the copy so a line can be traced back, and
-- so a line naming a generic item ("Skis") can offer that item's products.
--
-- Additive, so it is safe ahead of the code: nothing running today reads these,
-- and every order it can see has a course.

alter table public.gear_items
  add column if not exists price numeric(10,2) check (price >= 0);

comment on column public.gear_items.price is
  'What we charge for it, offered to a gear order line when the line is added. Never read by anything a student or instructor sees.';

alter table public.gear_orders
  alter column instance_id drop not null,
  add column if not exists title text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists contact_name text,
  add column if not exists contact_email text;

alter table public.gear_orders
  add constraint gear_orders_course_or_title
    check (instance_id is not null or title is not null);

alter table public.gear_order_lines
  add column if not exists gear_item_id uuid references public.gear_items(id) on delete set null,
  add column if not exists url text,
  add column if not exists unit_price numeric(10,2) check (unit_price >= 0);

create index if not exists gear_order_lines_item_idx on public.gear_order_lines (gear_item_id);
