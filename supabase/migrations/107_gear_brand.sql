-- A product's brand, split out of its name.
--
-- The catalog is two levels: a type is what a list needs ("brake-assist
-- descender") and a product is something that satisfies it. The brand only
-- belongs to the second — a type is brandless by definition — so this is null
-- on types and that asymmetry is the point, not an omission.
--
-- Buried in the name, the brand could not be asked about (15 of 26 products
-- are Petzl, and nothing could tell you that) and nothing kept it consistent:
-- the same maker was entered as "BD" and "Black Diamond", "CT" and "Climbing
-- Technology", because no field knew a brand existed.
--
-- Free text with the UI offering brands already in use, exactly as categories
-- work. A brands table earns its place only once a brand needs data of its own
-- — a rep, an account number, a pro-deal discount — and not before.

alter table public.gear_items add column if not exists brand text;

comment on column public.gear_items.brand is
  'Maker of a product ("Petzl"). Null on types, which are brandless by definition. Display is brand + name.';

-- Brand is a facet to filter and group by, so index the lookup.
create index if not exists gear_items_brand on public.gear_items (brand) where brand is not null;
