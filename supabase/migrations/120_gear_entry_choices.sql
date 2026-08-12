-- "Bring one of these" as structure instead of prose.
--
-- The swiftwater list's Environmental Layers section says this today, across
-- three rows, in three notes that each describe the other two:
--
--   Thick wetsuit  — "Option 1 of 2, with a rain jacket."
--   Rain jacket    — "Worn with the wetsuit, as a layer to reduce wind chill."
--   Drysuit        — "Option 2 of 2, instead of the wetsuit and rain jacket."
--
-- That is (wetsuit AND rain jacket) OR drysuit, and it costs three edits to
-- add a fourth option. Worse, a student skimming the list sees three rows that
-- all look required — the only thing marking two of them optional is fine
-- print that has to be read in the right order.
--
-- A choice is modelled the way a section already is: not a row of its own, just
-- the agreement between the entries in it. `option_group` names the choice and
-- `option_branch` says which alternative an entry belongs to. Same group and
-- same branch means bring both — that's the AND. Different branch means either
-- will do — that's the OR.
--
-- The branch is a number rather than a label because nothing needs to name an
-- alternative: the portal prints "bring one of" and a bullet per branch, and
-- the editor counts them off by position. A number can't drift from what's
-- displayed the way a stored "Option 2" would once Option 1 is deleted.
--
-- Both columns are null for every entry that exists today, which is the common
-- case and stays free: gear that is simply required carries no choice at all.

alter table public.gear_list_entries
  add column if not exists option_group text,
  add column if not exists option_branch smallint;

comment on column public.gear_list_entries.option_group is
  'Names a choice within a section. Entries sharing it are alternatives to each other.';
comment on column public.gear_list_entries.option_branch is
  'Which alternative within option_group. Same branch = bring both (AND); different branch = either will do (OR).';

-- Half a choice is not a state worth being able to reach: a group with no
-- branch has no alternatives, and a branch with no group belongs to nothing.
alter table public.gear_list_entries
  drop constraint if exists gear_list_entries_option_pair;
alter table public.gear_list_entries
  add constraint gear_list_entries_option_pair
  check ((option_group is null) = (option_branch is null));

create index if not exists gear_list_entries_option_group
  on public.gear_list_entries (list_id, option_group);
