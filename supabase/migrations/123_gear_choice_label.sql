-- Stop making the choice's heading mandatory.
--
-- 120 used option_group as both the key that groups the alternatives and the
-- heading students read. That forced a name out of you before you had said
-- what the alternative even was — clicking "or" on a row opened a browser
-- prompt demanding a title for a choice with one item in it.
--
-- It also made renaming a structural edit: the name was the key, so changing it
-- rewrote every row and had to be checked for collisions against other choices
-- in the section.
--
-- Now option_group is an opaque key nobody reads, and option_label is the
-- heading — nullable, because most choices don't need one. "Bring one of" over
-- a wetsuit and a drysuit says everything; "Exposure protection" is a nicety,
-- not a requirement.
--
-- The existing choice keeps its words as its label. Its key stays the same
-- string, which is harmless: a key only has to be unique, not meaningless.

alter table public.gear_list_entries
  add column if not exists option_label text;

comment on column public.gear_list_entries.option_group is
  'Opaque key grouping a set of alternatives. Not shown to anyone — see option_label.';
comment on column public.gear_list_entries.option_label is
  'Optional heading over the alternatives. Null prints as a bare "bring one of".';

update public.gear_list_entries
set option_label = option_group
where option_group is not null and option_label is null;
