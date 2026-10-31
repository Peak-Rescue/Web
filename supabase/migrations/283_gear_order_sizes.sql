-- A team orders six jackets as two mediums and four larges, not as "6".
--
-- Sizes are whatever the gear is measured in: S/M/L, a ski length, a boot's
-- mondo. So they are text, and a product's list lives on the catalog and is
-- copied to the line like its name and price. A line with no list still takes
-- sizes, typed by whoever is answering, because most of the catalog has none
-- yet and a team should not be stuck waiting for us to fill it in.
--
-- qty_wanted stays the line's total, the sum of `sizes` whenever there are any,
-- so the total, the PDF and the email all keep reading the one number.
--
-- Additive, and safe ahead of the code.
alter table public.gear_items
  add column if not exists sizes text[] not null default '{}';

alter table public.gear_order_lines
  add column if not exists size_options text[] not null default '{}',
  add column if not exists sizes jsonb not null default '[]'::jsonb;

comment on column public.gear_order_lines.sizes is
  'What was asked for, as [{"size": "M", "qty": 2}]. qty_wanted is their sum whenever this is not empty.';
