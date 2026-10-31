-- A gear order's people, in the shape a course keeps them: any number of people,
-- each with any number of phones and emails. One name and one box of addresses
-- could not say who was who, and the course form had already solved it.
--
-- Expand only. contact_name and contact_email are copied here and left in place,
-- because the build running while this lands still reads them. They go in a
-- later migration, once nothing does.
alter table public.gear_orders
  add column if not exists contacts jsonb not null default '[]'::jsonb;

update public.gear_orders
   set contacts = jsonb_build_array(jsonb_build_object(
         'name', coalesce(contact_name, ''),
         'phones', '[]'::jsonb,
         'emails', to_jsonb(array(
           select e from regexp_split_to_table(coalesce(contact_email, ''), '[\s,;]+') as e where e <> ''
         ))
       ))
 where instance_id is null
   and contacts = '[]'::jsonb
   and (coalesce(contact_name, '') <> '' or coalesce(contact_email, '') <> '');
