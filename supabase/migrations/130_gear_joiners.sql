-- A relationship between two neighbours, instead of a container they point at.
--
-- 120 modelled "bring one of these" as a container with an identity: a key
-- (option_group), which alternative a row belonged to (option_branch), and a
-- heading (option_label, added in 123). Rows pointed into it.
--
-- Three things followed from that, and all three bit:
--
--   A container could exist before it had contents. Clicking "+ or" wrote the
--   grouping to the row immediately, so a click made and thought better of left
--   a row permanently claiming alternatives nobody ever named — and a row in a
--   group had no "+ or" button, so there was no way back either. Three rows
--   reached production that way and had to be cleared by hand.
--
--   The container's identity was separate from its rows, so the two could
--   disagree: a set with one member, an alternative with no sibling. Every
--   renderer grew a rule for reading the disagreements.
--
--   Membership was independent of position. The rows of a set needn't be
--   adjacent, so the editor pulled them together on screen and anchored the
--   block wherever the first one happened to sort.
--
-- The relationship is the honest unit. A row says how it is joined to the row
-- immediately above it — and nothing else. An operator with no row above it
-- refers to nothing and simply doesn't apply, so there is no key to dangle, no
-- alternative to be alone on, and nothing to create before it has contents.
--
-- A set is then a run of adjacent rows connected by joiners. AND binds tighter
-- than OR, so a run splits into alternatives at each OR and each alternative is
-- the rows AND-ed together within it. That is exactly what the old two columns
-- could express — a branch was a flat line of slots, and a run is too — so
-- nothing is lost and nothing nests deeper than it did.

do $$ begin
  create type public.gear_joiner as enum ('and', 'or', 'or_if_needed');
exception when duplicate_object then null;
end $$;

comment on type public.gear_joiner is
  'How a gear row is joined to the row above it. and = bring both; or = either will do; or_if_needed = acceptable instead of the one above, when they haven''t got it.';

alter table public.gear_list_entries
  add column if not exists joined_above public.gear_joiner;

comment on column public.gear_list_entries.joined_above is
  'Relationship to the row immediately above, within the same list, side and section. Null is an ordinary required row, which is nearly all of them.';

-- Preference was already implicit in the order — the alternative written first
-- is the one we recommend — and 'or_if_needed' is that said out loud, for the
-- case where the second choice is acceptable rather than equal. Two tiers, not
-- a ranking: ranks invite ordering things that have no order, and every
-- renderer then has to decide how to draw fourth place.

-- Backfill. Everything grouped today is one set of three rows on one list, and
-- its rows are already adjacent, so this is written to be correct rather than
-- clever: walk each list's rows in order, and where a row shares a set with the
-- row above it, say how.
--
-- Within one alternative (same branch) the rows are AND-ed. A row starting a
-- later alternative is OR-ed against what came before. Nothing backfills as
-- 'or_if_needed': the old model could not express preference, so claiming it
-- here would be inventing a fact nobody stated.
with ordered as (
  select
    id,
    option_group,
    option_branch,
    section,
    group_type,
    lag(option_group)  over w as prev_group,
    lag(option_branch) over w as prev_branch,
    lag(section)       over w as prev_section,
    lag(group_type)    over w as prev_group_type
  from public.gear_list_entries
  window w as (partition by list_id order by sort_order)
)
update public.gear_list_entries e
set joined_above = case when o.prev_branch = o.option_branch then 'and' else 'or' end::public.gear_joiner
from ordered o
where o.id = e.id
  and o.option_group is not null
  and o.prev_group = o.option_group
  and o.prev_section is not distinct from o.section
  and o.prev_group_type = o.group_type;

-- The old columns stay for now. The code that reads them is still deployed, and
-- a column dropped before its readers are gone takes every course page with it.
-- They come out in a follow-up migration once the app that reads joined_above
-- is live.
