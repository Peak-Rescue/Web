-- POCs become a structured list: each course carries contacts jsonb — an
-- array of { name, phones[], emails[] } — replacing the flat contact_* and
-- contact2_* columns (data is migrated in, then the old columns dropped).

alter table public.course_instances
  add column if not exists contacts jsonb not null default '[]'::jsonb;

update public.course_instances set contacts =
  case when contact_name is not null or contact_phone is not null or contact_email is not null then
    jsonb_build_array(jsonb_build_object(
      'name',   coalesce(contact_name, ''),
      'phones', to_jsonb(array_remove(array[contact_phone], null)),
      'emails', to_jsonb(array_remove(array[contact_email], null))))
  else '[]'::jsonb end
  ||
  case when contact2_name is not null or contact2_phone is not null or contact2_email is not null then
    jsonb_build_array(jsonb_build_object(
      'name',   coalesce(contact2_name, ''),
      'phones', to_jsonb(array_remove(array[contact2_phone], null)),
      'emails', to_jsonb(array_remove(array[contact2_email], null))))
  else '[]'::jsonb end;

alter table public.course_instances
  drop column if exists contact_name,
  drop column if exists contact_phone,
  drop column if exists contact_email,
  drop column if exists contact2_name,
  drop column if exists contact2_phone,
  drop column if exists contact2_email;
