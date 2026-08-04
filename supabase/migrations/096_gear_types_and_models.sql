-- Gear as types with models under them, plus "any of these will do".
--
-- The catalog drifted within a day of existing: "BD ATC Guide", "Petzl Rig or
-- Grigri" and "Descent device" were three rows for one piece of kit. None of
-- them are misspellings — they're the same object named at different levels of
-- abstraction, so no amount of fuzzy string matching would have caught them.
--
-- The fix is to let both levels exist on purpose. A type ("Descent device")
-- carries the models that satisfy it ("Petzl Grigri", "BD ATC Guide"). A list
-- names whichever level it means: the type when any will do, a model when it
-- has to be that one.
--
-- And often several models work but not all of them — the swiftwater list says
-- "An ATC or Reverso works great but the Camp OVO or Kong GiGi is more
-- compact". So an entry can name a subset, and the list reads "A or B".

-- A model points at its type. Types have no parent. One level only — enforced
-- in the server action, since a self-referencing depth check is a trigger's
-- worth of machinery for a rule nobody is trying to break.
alter table public.gear_items
  add column if not exists parent_id uuid references public.gear_items(id) on delete set null;

-- Genuine synonyms, for search only — "grigri" should find the item whether
-- it's typed as a model name or not. This is the small remainder that the
-- type/model split doesn't cover.
alter table public.gear_items
  add column if not exists aliases text[] not null default '{}';

create index if not exists gear_items_parent_idx on public.gear_items (parent_id);
create index if not exists gear_items_aliases_idx on public.gear_items using gin (aliases);

-- Which models satisfy one line of one list. Empty means the entry stands as
-- written — the type, or the single model it points at. Two or more means
-- "A or B".
create table if not exists public.gear_entry_options (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.gear_list_entries(id) on delete cascade,
  gear_item_id uuid not null references public.gear_items(id) on delete cascade,
  sort_order   int not null default 0,
  unique (entry_id, gear_item_id)
);

create index if not exists gear_entry_options_entry_idx on public.gear_entry_options (entry_id);

alter table public.gear_entry_options enable row level security;
create policy "gear entry options: admin" on public.gear_entry_options for all using (public.is_admin());
