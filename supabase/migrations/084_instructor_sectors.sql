-- Which sectors an instructor can work — military, civilian, or both.
--
-- This has been riding inside the expertise list as a `military` capability,
-- which conflates two different questions: "is this person skilled in the
-- discipline?" and "can they work this client type?". Dan Russell's only
-- expertise is military:lead, which can't mean a technical skill.
--
-- Additive on purpose: nothing is removed from instructor_capabilities yet, so
-- no one disappears from a staffing filter while this is being populated.
-- Empty array = not yet specified.

alter table public.instructors
  add column if not exists sectors text[] not null default '{}';

comment on column public.instructors.sectors is
  'Client sectors this instructor can work: military and/or civilian. Empty = unspecified.';

-- Seed from the existing military capability so the common case needs no data
-- entry: anyone already marked military can work military work, and everyone
-- active is assumed to work civilian unless someone says otherwise.
update public.instructors i
set sectors = (
  select array_agg(distinct s) from (
    select 'civilian' as s
    union all
    select 'military' where exists (
      select 1 from public.instructor_capabilities c
      where c.instructor_id = i.id and c.category = 'military'
    )
  ) t
)
where i.active and i.sectors = '{}';
