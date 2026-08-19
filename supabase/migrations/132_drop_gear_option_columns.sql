-- The container model, removed now that nothing reads it.
--
-- 130 added `joined_above` and backfilled it from these three columns, and the
-- app that reads it has been live since. Both models have been sitting side by
-- side saying the same thing, which is what made the switch a revert rather
-- than a repair if anything read wrong. The editor, the student portal and the
-- printed sheet have each been checked against a real list, so the fallback has
-- done its job and can go.
--
-- What is being dropped and why it has no successor:
--
--   option_group   the container's identity. A relationship between neighbours
--                  needs no name, so there is nothing to replace it with.
--   option_branch  which alternative a row belonged to. Position says this now:
--                  a run splits into alternatives at each OR.
--   option_label   the heading over a set. Sections already name things on a
--                  gear list, and the one label in the data — "Exposure
--                  protection" — is a section on that course now. A set of
--                  alternatives inside a section needs no second name.
--
-- The check constraint (option_group is null) = (option_branch is null) and the
-- index on (list_id, option_group) both hang off these columns and go with
-- them; Postgres drops dependent constraints and indexes with the column.

alter table public.gear_list_entries
  drop column if exists option_group,
  drop column if exists option_branch,
  drop column if exists option_label;
