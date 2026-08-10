-- A list's headings are not the catalog's categories.
--
-- One column was doing two jobs. `gear_items.category` is a fixed taxonomy an
-- instructor browses to find a plaquette. `gear_list_entries.category` is the
-- heading a student reads on their kit list — "Personal Rigging Equipment",
-- "Canyoning Gear", and on a new course whatever that course needs: "Nice to
-- have", "Bring this as well", "COA B".
--
-- Storing both as `category` invited exactly one mistake, which is to tidy one
-- into the other. It also left the list side with no UI at all: nothing wrote
-- the column, and a newly added row was seeded from the catalog's category, so
-- adding a wetsuit to a list that says "Environmental Layers" opened a second
-- section called "Environmental layers" beside it.
--
-- Different name for the different job. The taxonomy keeps `category`; the
-- editorial heading becomes `section`.

alter table public.gear_list_entries rename column category to section;

comment on column public.gear_list_entries.section is
  'Student-facing heading on this list. Free text, named per list. Not the catalog taxonomy — see gear_items.category for that.';

-- The casing twin that the missing UI already produced.
update public.gear_list_entries set section = 'Environmental Layers' where section = 'Environmental layers';
