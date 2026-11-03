-- A priced gear order made for a course: the client asked what we would sell
-- them for it. Not `instance_id`, which means the course's own order — the
-- required gear list, unpriced on purpose so the catalog never puts a price in
-- front of a course client unasked. An order is one or the other, never both,
-- and losing the course leaves the quote standing as an ordinary order.
alter table public.gear_orders
  add column if not exists for_instance_id uuid references public.course_instances(id) on delete set null;

create index if not exists gear_orders_for_instance_idx on public.gear_orders (for_instance_id);

alter table public.gear_orders drop constraint if exists gear_orders_one_course_link;
alter table public.gear_orders
  add constraint gear_orders_one_course_link check (instance_id is null or for_instance_id is null);
