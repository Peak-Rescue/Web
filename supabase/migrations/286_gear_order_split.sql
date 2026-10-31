-- A team that can only spend so much per purchase order needs one list as
-- several. The parts are ordinary orders, each with its own link and PDF, so
-- nothing downstream has to know about splitting. split_from is what lets the
-- original name its parts, and lets a split be undone before any part has gone.
--
-- Additive, and safe ahead of the code.
alter table public.gear_orders
  add column if not exists split_from uuid references public.gear_orders(id) on delete set null,
  add column if not exists split_cap numeric(12,2);

create index if not exists gear_orders_split_from_idx on public.gear_orders (split_from);
