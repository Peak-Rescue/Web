alter table profiles
  add column first_name text,
  add column last_name  text;

-- Migrate existing full_name data into split columns where possible
update profiles
set
  first_name = split_part(full_name, ' ', 1),
  last_name  = nullif(trim(substring(full_name from position(' ' in full_name))), '')
where full_name is not null;

-- Replace stored full_name with a generated column
alter table profiles drop column full_name;
alter table profiles
  add column full_name text generated always as (
    trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
  ) stored;
