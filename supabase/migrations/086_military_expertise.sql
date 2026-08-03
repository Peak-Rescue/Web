-- Split military expertise into real skill areas.
--
-- Until now the military sector had a single `military` sign-off covering nine
-- offerings — which is why Dan Russell's only qualification was "military".
-- The civilian side has always had proper categories; this gives the military
-- side the same.
--
-- Military and civilian expertise stay separate on purpose: Canyon Mobility
-- for a military client is its own sign-off, not an extension of Class C
-- Canyon Rescue.
--
-- Migration of existing data: `military:lead` currently means "can lead any
-- military course", so expanding it to all eight military categories at the
-- same role preserves today's meaning exactly rather than granting anything
-- new. Admins then narrow it per instructor where that's too generous.

insert into public.instructor_capabilities (instructor_id, category, role)
select c.instructor_id, m.category, c.role
from public.instructor_capabilities c
cross join (values
  ('mil_jungle'), ('mil_urban'), ('mil_mountain'), ('mil_canyon'),
  ('mil_water'), ('mil_cold_weather'), ('mil_small_team'), ('mil_aerial')
) as m(category)
where c.category = 'military'
on conflict (instructor_id, category) do nothing;

delete from public.instructor_capabilities where category = 'military';

-- Custom courses tagged 'military' get the same treatment: they were matching
-- against any military-capable instructor, and the tactical categories keep
-- that working. Courses combining military with a civilian category (e.g.
-- PR-0017 canyoning + military) keep both — the civilian tag still applies.
update public.course_instances
set custom_categories =
  array_remove(custom_categories, 'military')
  || array['mil_jungle', 'mil_urban', 'mil_mountain', 'mil_canyon',
           'mil_water', 'mil_cold_weather', 'mil_small_team', 'mil_aerial']
where custom_categories @> array['military'];

update public.library_items
set disciplines = array_remove(disciplines, 'military')
where disciplines @> array['military'];
