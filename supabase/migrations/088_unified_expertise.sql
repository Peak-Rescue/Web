-- Collapse the per-sector expertise split back into one list.
--
-- 086/087 gave military its own parallel skills. In practice the skills
-- overlap — swiftwater is swiftwater — and the same people work both sides so
-- long as they're cleared for the client type. So expertise is the skill, and
-- instructors.sectors is the gate; staffing requires both.
--
-- Skills with a civilian twin merge into it, keeping the stronger role.
-- Skills with no twin keep their own entry under a sector-neutral name.

with mapped as (
  select
    instructor_id,
    case category
      when 'mil_canyon'       then 'canyoning'
      when 'mil_water'        then 'swift_water'
      when 'mil_mountain'     then 'backcountry'
      when 'mil_aerial'       then 'aerial_evac'
      when 'mil_maritime'     then 'maritime'
      when 'mil_jungle'       then 'jungle_mobility'
      when 'mil_urban'        then 'urban_mobility'
      when 'mil_cold_weather' then 'cold_weather'
      when 'mil_small_team'   then 'small_team'
    end as target,
    role
  from public.instructor_capabilities
  where category like 'mil\_%'
)
insert into public.instructor_capabilities (instructor_id, category, role)
select instructor_id, target,
       case when bool_or(role = 'lead') then 'lead' else 'assist' end
from mapped
group by instructor_id, target
on conflict (instructor_id, category) do update
  set role = case
    when public.instructor_capabilities.role = 'lead' or excluded.role = 'lead' then 'lead'
    else 'assist'
  end;

delete from public.instructor_capabilities where category like 'mil\_%';

-- Same mapping for course tags.
update public.course_instances
set custom_categories = (
  select array_agg(distinct
    case c
      when 'mil_canyon'       then 'canyoning'
      when 'mil_water'        then 'swift_water'
      when 'mil_mountain'     then 'backcountry'
      when 'mil_aerial'       then 'aerial_evac'
      when 'mil_maritime'     then 'maritime'
      when 'mil_jungle'       then 'jungle_mobility'
      when 'mil_urban'        then 'urban_mobility'
      when 'mil_cold_weather' then 'cold_weather'
      when 'mil_small_team'   then 'small_team'
      else c
    end)
  from unnest(custom_categories) as c
)
where exists (select 1 from unnest(custom_categories) as c where c like 'mil\_%');

-- ─── Corrections from the team ──────────────────────────────────────────────
-- The blanket expansion in 086 gave every military-capable instructor all
-- nine tactical skills at one level, which was never true in detail. Two are
-- known precisely; the rest still want a pass.

-- Dan Russell: military only, lead in urban mobility, nothing else.
delete from public.instructor_capabilities
where instructor_id in (select id from public.instructors where name = 'Dan Russell');

insert into public.instructor_capabilities (instructor_id, category, role)
select id, 'urban_mobility', 'lead' from public.instructors where name = 'Dan Russell'
on conflict (instructor_id, category) do update set role = excluded.role;

-- Kevin Carey: military only, assist in jungle, urban, mountain (backcountry),
-- canyon and cold weather.
delete from public.instructor_capabilities
where instructor_id in (select id from public.instructors where name = 'Kevin Carey');

insert into public.instructor_capabilities (instructor_id, category, role)
select i.id, c.category, 'assist'
from public.instructors i
cross join (values
  ('jungle_mobility'), ('urban_mobility'), ('backcountry'), ('canyoning'), ('cold_weather')
) as c(category)
where i.name = 'Kevin Carey'
on conflict (instructor_id, category) do update set role = excluded.role;

update public.instructors
set sectors = array['military']
where name in ('Dan Russell', 'Kevin Carey');
