-- Say which relationship the products on a line have.
--
-- A line's products were always a disjunction — any of these will do — but
-- nothing on screen said so. "Black Diamond ATC Guide" and "Petzl Reverso" sat
-- side by side as two chips with nothing between them, which reads equally well
-- as "bring both". The one thing the row most needed to say was the one thing
-- it didn't.
--
-- Now the relationship is stored and printed: "ATC Guide or Reverso", or "ATC
-- Guide and Reverso" when you do need both.
--
-- One operator per line, not a tree. "(A or B) and C" is expressible as two
-- lines and is rare enough that buying it would cost every reader of a gear
-- list a set of brackets they didn't ask for.
--
-- Defaults to 'or', which is what every existing row already meant.

alter table public.gear_list_entries
  add column if not exists options_conjunction text not null default 'or';

alter table public.gear_list_entries
  drop constraint if exists gear_list_entries_options_conjunction;
alter table public.gear_list_entries
  add constraint gear_list_entries_options_conjunction
  check (options_conjunction in ('and', 'or'));

comment on column public.gear_list_entries.options_conjunction is
  'How this line''s products relate: ''or'' = any of them will do, ''and'' = you need all of them.';
